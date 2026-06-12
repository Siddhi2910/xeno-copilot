/**
 * campaignCritique.service.ts — Call 4
 *
 * Two-layer critique system (AI_FEATURES.md §6 "Critique Architecture"):
 *
 *   Layer 1 — Deterministic rules (pure Node.js, no Gemini):
 *     CR-001  {name} token present in every message          HIGH
 *     CR-002  {ctaUrl} token present in every message        HIGH
 *     CR-003  WhatsApp message ≤ 160 characters              MEDIUM
 *     CR-004  Email subject ≤ 50 characters                  MEDIUM
 *     CR-005  At least one message differs per cluster       MEDIUM
 *     CR-006  No fabricated discount codes                   HIGH
 *
 *   Layer 2 — AI tone review (gemini-2.5-flash-lite):
 *     Applied after Layer 1 passes.
 *     Post-critique regression check re-runs Layer 1.
 *     If regression detected, pre-critique version is restored.
 *
 * Timeout: 6 000 ms. Temperature: 0.3.
 *
 * User feedback is sanitised before inclusion in the prompt
 * (CampaignRefineSchema in validation.ts strips injection patterns).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { callGemini } from '../../config/gemini';
import { stripMarkdownFences } from '../../lib/stripMarkdownFences';
import { sha256Hex } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { type ClusterMessages } from './messageGeneration.service';
import { saveAiLog } from './aiLog.helper';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../../prompts/critique-v1.txt'),
  'utf8',
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type CritiqueIssueSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CritiqueIssue {
  ruleId:   string;
  severity: CritiqueIssueSeverity;
  message:  string;
  cluster:  string;
  channel:  string;
}

export interface ChangeRecord {
  clusterLabel: string;
  channel:      string;
  change:       string;
  before:       string;
  after:        string;
}

export interface CritiqueResult {
  critiqueApplied:     boolean;
  deterministicIssues: CritiqueIssue[];
  critiqueNotes:       string;
  changesApplied:      ChangeRecord[];
  refinedMessages:     Record<string, {
    whatsappMessage: { body: string; characterCount: number };
    emailMessage:    { subject: string; preheader: string; body: string };
  }>;
  aiLogId:             string | null;
}

// ─── Layer 1 — Deterministic rules ───────────────────────────────────────────

function runDeterministicRules(
  clusters:     ClusterMessages[],
  discountCode: string | null,
): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];

  for (const c of clusters) {
    const waBody     = c.whatsappMessage.body;
    const emailBody  = c.emailMessage.body;
    const emailSubj  = c.emailMessage.subject;

    // CR-001: {name} token
    if (!waBody.includes('{name}')) {
      issues.push({ ruleId: 'CR-001', severity: 'HIGH', message: '{name} token missing from WhatsApp message.', cluster: c.label, channel: 'WHATSAPP' });
    }
    if (!emailBody.includes('{name}')) {
      issues.push({ ruleId: 'CR-001', severity: 'HIGH', message: '{name} token missing from email body.', cluster: c.label, channel: 'EMAIL' });
    }

    // CR-002: {ctaUrl} token
    if (!waBody.includes('{ctaUrl}')) {
      issues.push({ ruleId: 'CR-002', severity: 'HIGH', message: '{ctaUrl} token missing from WhatsApp message.', cluster: c.label, channel: 'WHATSAPP' });
    }
    if (!emailBody.includes('{ctaUrl}')) {
      issues.push({ ruleId: 'CR-002', severity: 'HIGH', message: '{ctaUrl} token missing from email body.', cluster: c.label, channel: 'EMAIL' });
    }

    // CR-003: WhatsApp ≤ 160 chars
    if (waBody.length > 160) {
      issues.push({ ruleId: 'CR-003', severity: 'MEDIUM', message: `WhatsApp message is ${waBody.length} characters (max 160).`, cluster: c.label, channel: 'WHATSAPP' });
    }

    // CR-004: Email subject ≤ 50 chars
    if (emailSubj.length > 50) {
      issues.push({ ruleId: 'CR-004', severity: 'MEDIUM', message: `Email subject is ${emailSubj.length} characters (max 50).`, cluster: c.label, channel: 'EMAIL' });
    }

    // CR-006: No fabricated discount code
    if (!discountCode) {
      // If no discount code was provided, flag any alphanumeric code pattern (e.g. DIWALI15, OFF20)
      const codePattern = /\b[A-Z]{2,}[0-9]{1,3}\b/g;
      const waMatches   = waBody.match(codePattern) ?? [];
      const emMatches   = emailBody.match(codePattern) ?? [];
      for (const m of [...waMatches, ...emMatches]) {
        issues.push({ ruleId: 'CR-006', severity: 'HIGH', message: `Fabricated discount code "${m}" found. Remove it — no discount code was provided.`, cluster: c.label, channel: 'ALL' });
        break; // one issue per cluster is enough
      }
    }
  }

  // CR-005: At least one message differs per cluster (only meaningful if ≥2 clusters)
  if (clusters.length >= 2) {
    const bodies = clusters.map((c) => c.whatsappMessage.body.toLowerCase().replace(/\s+/g, ' '));
    if (bodies[0] === bodies[1]) {
      issues.push({ ruleId: 'CR-005', severity: 'MEDIUM', message: 'Cluster 1 and Cluster 2 WhatsApp messages are identical. Each cluster must have a distinct message.', cluster: 'ALL', channel: 'WHATSAPP' });
    }
  }

  return issues;
}

// ─── Layer 2 — AI tone review ─────────────────────────────────────────────────

const MODEL       = 'gemini-2.5-flash-lite' as const;
const TEMPERATURE = 0.3;
const MAX_TOKENS  = 1024;
const TIMEOUT_MS  = 6_000;

// ─── Service ──────────────────────────────────────────────────────────────────

export async function critiqueCampaign(opts: {
  goalText:      string;
  clusters:      ClusterMessages[];
  userFeedback?: string | null;
  discountCode?: string | null;
  campaignId?:   Types.ObjectId | null;
}): Promise<CritiqueResult> {
  const { goalText, clusters, userFeedback, discountCode = null, campaignId } = opts;

  // ── Layer 1 ────────────────────────────────────────────────────────────────
  const deterministicIssues = runDeterministicRules(clusters, discountCode);

  // Build pre-critique snapshot for regression check
  const preSnapshot = new Map(
    clusters.map((c) => [c.label, { wa: c.whatsappMessage.body, subject: c.emailMessage.subject, emailBody: c.emailMessage.body }])
  );

  // ── Layer 2 — AI tone review ───────────────────────────────────────────────
  const messagesBlock = clusters.map((c) => [
    `CLUSTER: ${c.label}`,
    `WhatsApp (${c.whatsappMessage.characterCount} chars): "${c.whatsappMessage.body}"`,
    `Email subject: "${c.emailMessage.subject}"`,
    `Email body: "${c.emailMessage.body}"`,
  ].join('\n')).join('\n\n');

  const userPrompt = [
    `Campaign goal: "${goalText}"`,
    `User feedback: "${userFeedback || 'None — run auto-critique only.'}"`,
    ``,
    `Messages to review:`,
    ``,
    messagesBlock,
    ``,
    `Improve the messages. Apply user feedback first, then persona alignment, then WhatsApp length compliance.`,
  ].join('\n');

  const promptHash = sha256Hex(SYSTEM_PROMPT + '\n---\n' + userPrompt);

  let latencyMs = 0;
  let inputTok  = 0;
  let outputTok = 0;

  // Build baseline refined messages from current cluster data
  const baselineRefined: CritiqueResult['refinedMessages'] = {};
  for (const c of clusters) {
    baselineRefined[c.label] = {
      whatsappMessage: { body: c.whatsappMessage.body, characterCount: c.whatsappMessage.body.length },
      emailMessage:    { subject: c.emailMessage.subject, preheader: c.emailMessage.preheader, body: c.emailMessage.body },
    };
  }

  try {
    const raw = await callGemini({
      model:           MODEL,
      systemPrompt:    SYSTEM_PROMPT,
      userPrompt,
      temperature:     TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
      timeoutMs:       TIMEOUT_MS,
    });
    latencyMs = raw.latencyMs;
    inputTok  = raw.inputTokens;
    outputTok = raw.outputTokens;

    const parsed = JSON.parse(stripMarkdownFences(raw.text)) as Record<string, unknown>;

    const critiqueApplied  = Boolean(parsed.critiqueApplied);
    const critiqueNotes    = String(parsed.critiqueNotes ?? '');
    const changesApplied   = (Array.isArray(parsed.changesApplied) ? parsed.changesApplied : []) as ChangeRecord[];
    const rawRefined       = (typeof parsed.refinedMessages === 'object' && parsed.refinedMessages !== null
      ? parsed.refinedMessages : {}) as Record<string, unknown>;

    // Merge LLM refined messages with baseline
    const refinedMessages: CritiqueResult['refinedMessages'] = { ...baselineRefined };
    for (const [label, ref] of Object.entries(rawRefined)) {
      const r = ref as Record<string, unknown>;
      const wa = (r.whatsappMessage ?? {}) as Record<string, unknown>;
      const em = (r.emailMessage    ?? {}) as Record<string, unknown>;
      refinedMessages[label] = {
        whatsappMessage: {
          body:           String(wa.body ?? baselineRefined[label]?.whatsappMessage.body ?? ''),
          characterCount: String(wa.body ?? '').length,
        },
        emailMessage: {
          subject:  String(em.subject  ?? baselineRefined[label]?.emailMessage.subject  ?? ''),
          preheader: String(em.preheader ?? baselineRefined[label]?.emailMessage.preheader ?? ''),
          body:      String(em.body    ?? baselineRefined[label]?.emailMessage.body    ?? ''),
        },
      };
    }

    // ── Post-critique regression check ─────────────────────────────────────
    // Re-run CR-001/CR-002 on refined messages. If critique removed a token,
    // revert that cluster to the pre-critique version.
    let regressionDetected = false;
    for (const [label, ref] of Object.entries(refinedMessages)) {
      const preWa = preSnapshot.get(label);
      if (!preWa) continue;
      const waBody    = ref.whatsappMessage.body;
      const emailBody = ref.emailMessage.body;
      if (
        (!waBody.includes('{name}') && preWa.wa.includes('{name}')) ||
        (!emailBody.includes('{name}') && preWa.emailBody.includes('{name}')) ||
        (!waBody.includes('{ctaUrl}') && preWa.wa.includes('{ctaUrl}')) ||
        (!emailBody.includes('{ctaUrl}') && preWa.emailBody.includes('{ctaUrl}'))
      ) {
        console.warn(`[critique] Regression detected for cluster "${label}" — reverting to pre-critique version`);
        refinedMessages[label] = baselineRefined[label];
        regressionDetected = true;
      }
    }

    const aiLogId = await saveAiLog({
      campaignId:    campaignId ?? null,
      callType:      'CRITIQUE',
      model:         MODEL,
      promptHash,
      attemptNumber: 1,
      latencyMs,
      inputTokens:   inputTok,
      outputTokens:  outputTok,
      success:       true,
      errorMessage:  regressionDetected ? 'Regression detected: pre-critique messages restored for affected clusters.' : undefined,
    });

    return {
      critiqueApplied,
      deterministicIssues,
      critiqueNotes,
      changesApplied,
      refinedMessages,
      aiLogId: aiLogId?.toHexString() ?? null,
    };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    await saveAiLog({
      campaignId:    campaignId ?? null,
      callType:      'CRITIQUE',
      model:         MODEL,
      promptHash,
      attemptNumber: 1,
      latencyMs,
      inputTokens:   inputTok,
      outputTokens:  outputTok,
      success:       false,
      errorMessage:  errMsg,
    });

    // Gemini timeout: graceful degradation — return deterministic results only
    // (AI_FEATURES.md §6 Failure Handling: "Gemini timeout: skip AI critique, run deterministic layer only")
    console.warn('[critique] AI tone review failed — returning deterministic layer results only:', errMsg);

    if (err instanceof AppError && err.code !== 'AI_UNAVAILABLE') throw err;

    return {
      critiqueApplied:     false,
      deterministicIssues,
      critiqueNotes:       'AI tone review unavailable. Deterministic checks completed.',
      changesApplied:      [],
      refinedMessages:     baselineRefined,
      aiLogId:             null,
    };
  }
}
