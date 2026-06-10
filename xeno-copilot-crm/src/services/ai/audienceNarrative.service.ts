/**
 * audienceNarrative.service.ts — Call 2
 *
 * Generates a plain-English business narrative for a campaign audience,
 * cluster cards with customer personas, and a revenue estimate.
 *
 * Runs in parallel with Call 3 (messageGeneration) via Promise.all.
 * Timeout: 5 000 ms. Temperature: 0.4 (narrative variation; facts locked to input).
 *
 * Post-generation guard: if the LLM fabricates a number not present in the
 * audience data, the narrative is flagged as unverified and raw data is returned.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { callGemini } from '../../config/gemini';
import { stripMarkdownFences } from '../../lib/stripMarkdownFences';
import { sha256Hex } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { type AudienceStats } from '../audience.service';
import { CONVERSION_BENCHMARKS } from '../../config/benchmarks';
import { saveAiLog } from './aiLog.helper';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../../prompts/audienceNarrative-v1.txt'),
  'utf8',
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PersonaCard {
  name:               string;
  age_hint:           string;
  behaviour_pattern:  string;
  brand_relationship: string;
  motivation:         string;
  ideal_message_tone: string;
}

export interface NarrativeClusterCard {
  label:              string;
  count:              number;
  rfmSegment:         string;
  avgSpend:           number;
  reachability:       string;
  toneRecommendation: string;
  persona:            PersonaCard | null;
}

export interface AudienceNarrativeResult {
  narrative:      string;       // null if numeric-check fails — raw data used instead
  narrativeValid: boolean;      // false if LLM invented a statistic
  clusterCards:   NarrativeClusterCard[];
  revenueEstimate: {
    min:            number;
    max:            number;
    conversionRate: number;
    source:         string;
  };
  aiLogId: string | null;
}

// ─── Numeric consistency guard ────────────────────────────────────────────────
// Extract all standalone integers from text; verify each appears in allowedNums.
// Protects against hallucinated statistics. (AI_FEATURES.md §3 Failure Handling)

function narrativeNumbersAreValid(narrative: string, allowedNums: Set<number>): boolean {
  const matches = narrative.match(/\b\d+(\.\d+)?\b/g);
  if (!matches) return true;
  for (const m of matches) {
    const n = parseFloat(m);
    // Only check whole numbers and simple decimals (ignore very small percentages)
    if (Number.isInteger(n) && n > 1 && !allowedNums.has(n)) return false;
  }
  return true;
}

// ─── Schema validation ────────────────────────────────────────────────────────

interface LlmNarrativeOutput {
  narrative:       unknown;
  clusterCards:    unknown;
  revenueEstimate: unknown;
}

function validateLlmOutput(raw: unknown): LlmNarrativeOutput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('LLM output is not an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.narrative !== 'string') throw new Error('narrative must be a string');
  if (!Array.isArray(obj.clusterCards))  throw new Error('clusterCards must be an array');
  if (typeof obj.revenueEstimate !== 'object' || obj.revenueEstimate === null) {
    throw new Error('revenueEstimate must be an object');
  }
  return obj as unknown as LlmNarrativeOutput;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const MODEL       = 'gemini-1.5-flash' as const;
const TEMPERATURE = 0.4;
const MAX_TOKENS  = 768;
const TIMEOUT_MS  = 5_000;

export async function generateAudienceNarrative(opts: {
  goalText:     string;
  audience:     AudienceStats;
  goalType:     string;
  brandName?:   string;
  industry?:    string;
  currency?:    string;
  campaignId?:  Types.ObjectId | null;
}): Promise<AudienceNarrativeResult> {
  const {
    goalText, audience, goalType,
    brandName = 'Your Brand',
    industry  = 'retail',
    currency  = '₹',
    campaignId,
  } = opts;

  const { count, medianAOV, channelMix, clusters } = audience;

  // Early exit — no Gemini call for empty audiences (AI_FEATURES.md §3 Failure Handling)
  if (count === 0) {
    throw new AppError(
      422,
      'UNPROCESSABLE',
      'No customers match this goal. Try adjusting the targeting criteria.',
    );
  }

  // Build channel reachability text
  const total = count || 1;
  const channelLines = Object.entries(channelMix)
    .sort(([, a], [, b]) => b - a)
    .map(([ch, n]) => `${ch} ${Math.round((n / total) * 100)}%`)
    .join(', ');

  // Build RFM breakdown text
  const rfmLines = clusters
    .map((c) => `${c.rfmSegment}: ${c.count} (${Math.round((c.count / total) * 100)}%)`)
    .join(', ');

  // Revenue estimate context
  const benchmark = CONVERSION_BENCHMARKS[goalType] ?? CONVERSION_BENCHMARKS['CUSTOM'];
  const convRate  = benchmark.rate;
  const revText   = `No historical data. Use benchmark: ${Math.round(convRate * 100)}% conversion rate (${benchmark.source}).`;

  // Cluster list for prompt
  const clusterList = clusters.map((c, i) => {
    const chBreakdown = Object.entries(c.channels)
      .map(([ch, n]) => `${ch} ${Math.round((n / (c.count || 1)) * 100)}%`)
      .join(', ');
    return `${i + 1}. ${c.rfmSegment} — ${c.count} customers, avg spend ${currency}${c.avgSpend}, ${chBreakdown}`;
  }).join('\n');

  const userPrompt = [
    `Brand: ${brandName} (${industry}, currency: ${currency})`,
    `Campaign goal: "${goalText}"`,
    ``,
    `Audience data:`,
    `- Total matched: ${count} customers`,
    `- Median order value: ${currency}${medianAOV}`,
    `- Channel reachability: ${channelLines || 'unknown'}`,
    `- RFM breakdown: ${rfmLines || 'n/a'}`,
    ``,
    `Historical conversion rate for this campaign type:`,
    revText,
    ``,
    `Clusters to describe:`,
    clusterList,
    ``,
    `Generate narrative, cluster cards, and revenue estimate.`,
  ].join('\n');

  const systemPrompt = SYSTEM_PROMPT;
  const promptHash   = sha256Hex(systemPrompt + '\n---\n' + userPrompt);

  // Numbers that are legitimately in the input (for hallucination guard)
  const allowedNums = new Set<number>([
    count, medianAOV, Math.round(convRate * 100),
    ...clusters.flatMap((c) => [c.count, c.avgSpend, ...Object.values(c.channels)]),
    ...Object.values(channelMix),
  ]);

  let llmText   = '';
  let inputTok  = 0;
  let outputTok = 0;
  let latencyMs = 0;

  // Fallback: if Gemini fails, return raw data without narrative
  const buildFallback = (logId: string | null): AudienceNarrativeResult => ({
    narrative:      '',
    narrativeValid: false,
    clusterCards:   clusters.map((c) => ({
      label:              c.rfmSegment,
      count:              c.count,
      rfmSegment:         c.rfmSegment,
      avgSpend:           c.avgSpend,
      reachability:       Object.entries(c.channels).map(([ch, n]) => `${Math.round((n/c.count||1)*100)}% via ${ch}`).join(', '),
      toneRecommendation: '',
      persona:            null,
    })),
    revenueEstimate: {
      min:            Math.round(count * convRate * medianAOV * 0.7),
      max:            Math.round(count * convRate * medianAOV * 1.3),
      conversionRate: convRate,
      source:         benchmark.source,
    },
    aiLogId: logId,
  });

  try {
    const raw = await callGemini({
      model:           MODEL,
      systemPrompt,
      userPrompt,
      temperature:     TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
      timeoutMs:       TIMEOUT_MS,
    });
    llmText   = raw.text;
    inputTok  = raw.inputTokens;
    outputTok = raw.outputTokens;
    latencyMs = raw.latencyMs;

    const parsed    = JSON.parse(stripMarkdownFences(llmText));
    const validated = validateLlmOutput(parsed);

    const narrative        = String(validated.narrative);
    const narrativeIsValid = narrativeNumbersAreValid(narrative, allowedNums);

    // Parse cluster cards
    const rawCards  = validated.clusterCards as Array<Record<string, unknown>>;
    const clusterCards: NarrativeClusterCard[] = rawCards.map((card) => ({
      label:              String(card.label    ?? ''),
      count:              Number(card.count    ?? 0),
      rfmSegment:         String(card.rfmSegment ?? card.label ?? ''),
      avgSpend:           Number(card.avgSpend  ?? 0),
      reachability:       String(card.reachability ?? ''),
      toneRecommendation: String(card.toneRecommendation ?? ''),
      persona:            card.persona
        ? {
            name:               String((card.persona as Record<string,unknown>).name ?? ''),
            age_hint:           String((card.persona as Record<string,unknown>).age_hint ?? ''),
            behaviour_pattern:  String((card.persona as Record<string,unknown>).behaviour_pattern ?? ''),
            brand_relationship: String((card.persona as Record<string,unknown>).brand_relationship ?? ''),
            motivation:         String((card.persona as Record<string,unknown>).motivation ?? ''),
            ideal_message_tone: String((card.persona as Record<string,unknown>).ideal_message_tone ?? ''),
          }
        : null,
    }));

    // Parse revenue estimate
    const rev = validated.revenueEstimate as Record<string, unknown>;
    const revenueEstimate = {
      min:            Math.round(Number(rev.min ?? 0)),
      max:            Math.round(Number(rev.max ?? 0)),
      conversionRate: Number(rev.conversionRate ?? convRate),
      source:         String(rev.source ?? benchmark.source),
    };

    const aiLogId = await saveAiLog({
      campaignId:    campaignId ?? null,
      callType:      'AUDIENCE_NARRATIVE',
      model:         MODEL,
      promptHash,
      attemptNumber: 1,
      latencyMs,
      inputTokens:   inputTok,
      outputTokens:  outputTok,
      success:       true,
    });

    return {
      narrative:       narrativeIsValid ? narrative : '',
      narrativeValid:  narrativeIsValid,
      clusterCards,
      revenueEstimate,
      aiLogId:         aiLogId?.toHexString() ?? null,
    };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    const aiLogId = await saveAiLog({
      campaignId:    campaignId ?? null,
      callType:      'AUDIENCE_NARRATIVE',
      model:         MODEL,
      promptHash,
      attemptNumber: 1,
      latencyMs,
      inputTokens:   inputTok,
      outputTokens:  outputTok,
      success:       false,
      errorMessage:  errMsg,
    });

    // Propagate hard AppErrors (empty audience, timeout with retryAfterMs)
    if (err instanceof AppError) throw err;

    // Soft failure: return deterministic fallback without narrative
    console.warn('[audienceNarrative] Gemini failed — returning deterministic fallback:', errMsg);
    return buildFallback(aiLogId?.toHexString() ?? null);
  }
}
