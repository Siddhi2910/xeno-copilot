/**
 * messageGeneration.service.ts — Call 3
 *
 * Generates channel-specific marketing messages for each audience cluster.
 * Uses gemini-2.5-flash-lite for higher-quality creative output.
 *
 * Post-generation validation (AI_FEATURES.md §5 Failure Handling):
 *   CR-A  {name} token present in every message
 *   CR-B  {ctaUrl} token present in every message
 *   CR-C  WhatsApp body ≤ 160 characters (auto-retry up to 2 times)
 *   CR-D  Email subject ≤ 50 characters (truncated at word boundary if over)
 *   CR-E  Two-cluster messages must differ (>85% similarity triggers retry)
 *
 * Timeout: 8 000 ms. Temperature: 0.7.
 * Max retries for length/token violations: 2.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { callGemini } from '../../config/gemini';
import { stripMarkdownFences } from '../../lib/stripMarkdownFences';
import { sha256Hex } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { type NarrativeClusterCard } from './audienceNarrative.service';
import { saveAiLog } from './aiLog.helper';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '../../prompts/messageGeneration-v1.txt'),
  'utf8',
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhatsAppMessage {
  body:           string;
  characterCount: number;
  ctaUrl:         string;
  subject:        null;
}

export interface EmailMessage {
  subject:  string;
  preheader: string;
  body:     string;
  ctaUrl:   string;
}

export interface ClusterMessages {
  label:           string;
  whatsappMessage: WhatsAppMessage;
  emailMessage:    EmailMessage;
}

export interface MessageGenerationResult {
  clusters: ClusterMessages[];
  warnings: string[];          // non-fatal issues flagged for user review
  aiLogId:  string | null;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function hasToken(text: string, token: string): boolean {
  return text.includes(token);
}

function truncateSubject(subject: string): string {
  if (subject.length <= 50) return subject;
  const trimmed = subject.slice(0, 50);
  const lastSpace = trimmed.lastIndexOf(' ');
  return lastSpace > 30 ? trimmed.slice(0, lastSpace) : trimmed;
}

// Simple word-overlap similarity (Jaccard) to detect near-identical cluster messages
function messageSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

// ─── Schema validation ────────────────────────────────────────────────────────

interface LlmMsgCluster {
  label:           unknown;
  whatsappMessage: unknown;
  emailMessage:    unknown;
}

function validateLlmOutput(raw: unknown): LlmMsgCluster[] {
  if (typeof raw !== 'object' || raw === null) throw new Error('LLM output is not an object');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.clusters)) throw new Error('clusters must be an array');
  return obj.clusters as LlmMsgCluster[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

const MODEL       = 'gemini-2.5-flash-lite' as const;
const TEMPERATURE = 0.7;
const MAX_TOKENS  = 1024;
const TIMEOUT_MS  = 8_000;
const MAX_RETRIES = 2;

export async function generateMessages(opts: {
  goalText:     string;
  clusters:     NarrativeClusterCard[];
  brandName?:   string;
  industry?:    string;
  ctaUrl?:      string;
  discountCode?: string | null;
  campaignId?:  Types.ObjectId | null;
}): Promise<MessageGenerationResult> {
  const {
    goalText, clusters,
    brandName    = 'Your Brand',
    industry     = 'retail',
    ctaUrl       = 'https://yourstore.com',
    discountCode = null,
    campaignId,
  } = opts;

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{brandName}', brandName)
    .replace('{industry}',  industry);

  const clusterBlock = clusters.map((c, i) => [
    `CLUSTER ${i + 1}: ${c.label}`,
    `- Segment: ${c.rfmSegment}`,
    `- Persona: ${c.persona?.behaviour_pattern ?? 'N/A'}`,
    `- Tone guide: ${c.persona?.ideal_message_tone ?? c.toneRecommendation ?? 'professional and warm'}`,
    `- Channels to generate: WHATSAPP, EMAIL`,
  ].join('\n')).join('\n\n');

  const userPrompt = [
    `Brand: ${brandName}`,
    `Campaign goal: "${goalText}"`,
    `CTA URL: ${ctaUrl}`,
    `Discount code (if any): ${discountCode ?? 'none'}`,
    ``,
    `Clusters to generate messages for:`,
    ``,
    clusterBlock,
    ``,
    `Write distinct messages for each cluster. Do not use the same body text across clusters.`,
  ].join('\n');

  const promptHash = sha256Hex(systemPrompt + '\n---\n' + userPrompt);

  let additionalConstraint = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let llmText   = '';
    let inputTok  = 0;
    let outputTok = 0;
    let latencyMs = 0;

    const actualUserPrompt = additionalConstraint
      ? userPrompt + '\n\n' + additionalConstraint
      : userPrompt;

    try {
      const raw = await callGemini({
        model:           MODEL,
        systemPrompt,
        userPrompt:      actualUserPrompt,
        temperature:     TEMPERATURE,
        maxOutputTokens: MAX_TOKENS,
        timeoutMs:       TIMEOUT_MS,
      });
      llmText   = raw.text;
      inputTok  = raw.inputTokens;
      outputTok = raw.outputTokens;
      latencyMs = raw.latencyMs;

      const rawClusters = validateLlmOutput(JSON.parse(stripMarkdownFences(llmText)));

      const warnings: string[] = [];
      const result: ClusterMessages[] = [];
      let retryReason = '';

      for (let i = 0; i < clusters.length; i++) {
        const raw = rawClusters[i] as unknown as Record<string, unknown> | undefined;
        if (!raw) {
          // LLM returned fewer clusters than expected
          throw new Error(`LLM returned only ${rawClusters.length} cluster(s); expected ${clusters.length}`);
        }

        const wa  = (raw.whatsappMessage ?? {}) as Record<string, unknown>;
        const em  = (raw.emailMessage    ?? {}) as Record<string, unknown>;
        const label = String(raw.label ?? clusters[i].label);

        // WhatsApp body
        let waBody = String(wa.body ?? '');
        if (waBody.length > 160) {
          retryReason = `WhatsApp message for "${label}" is ${waBody.length} characters (max 160). HARD REQUIREMENT: WhatsApp body MUST be under 160 characters. Remove words, do not add.`;
        }

        // Token presence (warning, not blocker — AI_FEATURES.md §11)
        if (!hasToken(waBody, '{name}'))   warnings.push(`WhatsApp message for "${label}" is missing {name} token.`);
        if (!hasToken(waBody, '{ctaUrl}')) warnings.push(`WhatsApp message for "${label}" is missing {ctaUrl} token.`);

        let emailSubject = String(em.subject ?? '');
        if (emailSubject.length > 50) {
          emailSubject = truncateSubject(emailSubject);
          warnings.push(`Email subject for "${label}" was truncated to 50 characters.`);
        }

        const emailBody = String(em.body ?? '');
        if (!hasToken(emailBody, '{name}'))   warnings.push(`Email body for "${label}" is missing {name} token.`);
        if (!hasToken(emailBody, '{ctaUrl}')) warnings.push(`Email body for "${label}" is missing {ctaUrl} token.`);

        result.push({
          label,
          whatsappMessage: {
            body:           waBody,
            characterCount: waBody.length,
            ctaUrl:         String(wa.ctaUrl ?? ctaUrl),
            subject:        null,
          },
          emailMessage: {
            subject:  emailSubject,
            preheader: String(em.preheader ?? ''),
            body:      emailBody,
            ctaUrl:    String(em.ctaUrl ?? ctaUrl),
          },
        });
      }

      // Similarity check across cluster WhatsApp messages
      if (result.length >= 2) {
        const sim = messageSimilarity(result[0].whatsappMessage.body, result[1].whatsappMessage.body);
        if (sim > 0.85) {
          retryReason = `Cluster 1 and Cluster 2 WhatsApp messages are too similar (${Math.round(sim * 100)}% overlap). Messages MUST be meaningfully different for each cluster.`;
        }
      }

      if (retryReason && attempt <= MAX_RETRIES) {
        additionalConstraint = retryReason;
        await saveAiLog({
          campaignId:    campaignId ?? null,
          callType:      'MESSAGE_GEN',
          model:         MODEL,
          promptHash,
          attemptNumber: attempt,
          latencyMs,
          inputTokens:   inputTok,
          outputTokens:  outputTok,
          success:       false,
          errorMessage:  retryReason,
        });
        continue;  // retry
      }

      const aiLogId = await saveAiLog({
        campaignId:    campaignId ?? null,
        callType:      'MESSAGE_GEN',
        model:         MODEL,
        promptHash,
        attemptNumber: attempt,
        latencyMs,
        inputTokens:   inputTok,
        outputTokens:  outputTok,
        success:       true,
      });

      return { clusters: result, warnings, aiLogId: aiLogId?.toHexString() ?? null };

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      await saveAiLog({
        campaignId:    campaignId ?? null,
        callType:      'MESSAGE_GEN',
        model:         MODEL,
        promptHash,
        attemptNumber: attempt,
        latencyMs,
        inputTokens:   inputTok,
        outputTokens:  outputTok,
        success:       false,
        errorMessage:  errMsg,
      });

      if (err instanceof AppError) throw err;

      // Surface rate-limit / quota errors immediately with a clear message
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('quota')) {
        throw new AppError(429, 'RATE_LIMITED', 'AI quota exceeded. Please wait a moment and try again.');
      }

      if (attempt > MAX_RETRIES) {
        throw new AppError(502, 'AI_UNAVAILABLE', 'Message generation failed after retries. Please try again.');
      }
      // Retry on parse errors
      additionalConstraint = 'Previous attempt failed to return valid JSON. Return ONLY a JSON object.';
    }
  }

  // Unreachable — TypeScript requires a return
  throw new AppError(502, 'AI_UNAVAILABLE', 'Message generation failed.');
}
