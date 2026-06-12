/**
 * gemini.ts
 *
 * Low-level Gemini API wrapper.
 * - Two model tiers: Flash (speed) + Pro (quality) — per AI_FEATURES.md §8.6
 * - Enforces per-call timeouts via Promise.race
 * - Returns raw text + token usage (services own logging + parsing)
 * - JSON mode always enabled (responseMimeType: 'application/json')
 *
 * Never exposes the API key; never logs prompt content.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../middleware/errorHandler';

// ─── Lazy client ─────────────────────────────────────────────────────────────
// Not evaluated at import time so the absence of GEMINI_API_KEY does not crash
// routes that don't touch AI (e.g. health, customers).

let _genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new AppError(
        500,
        'INTERNAL_ERROR',
        'GEMINI_API_KEY environment variable is not set.',
      );
    }
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type GeminiModel = 'gemini-2.5-flash-lite';

export interface GeminiCallResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  latencyMs:    number;
}

// ─── Cost table (AI_FEATURES.md §9) ──────────────────────────────────────────

const INPUT_COST_PER_M: Record<GeminiModel, number>  = {
  'gemini-2.5-flash-lite': 0.075,
};
const OUTPUT_COST_PER_M: Record<GeminiModel, number> = {
  'gemini-2.5-flash-lite': 0.30,
};

export function estimateCostUsd(
  model:        GeminiModel,
  inputTokens:  number,
  outputTokens: number,
): number {
  return (
    (inputTokens  * INPUT_COST_PER_M[model])  / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_M[model]) / 1_000_000
  );
}

// ─── Core call ────────────────────────────────────────────────────────────────

export async function callGemini(opts: {
  model:           GeminiModel;
  systemPrompt:    string;
  userPrompt:      string;
  temperature:     number;
  maxOutputTokens: number;
  timeoutMs:       number;
}): Promise<GeminiCallResult> {
  const { model, systemPrompt, userPrompt, temperature, maxOutputTokens, timeoutMs } = opts;

  const genModel = getClient().getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
      maxOutputTokens,
    },
  });

  const start = Date.now();

  const apiPromise = genModel.generateContent(userPrompt);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new AppError(
            502,
            'AI_UNAVAILABLE',
            'The AI model is temporarily unavailable. Please try again in a few seconds.',
            undefined,
            [{ retryAfterMs: 3000 }],
          ),
        ),
      timeoutMs,
    ),
  );

  const result = await Promise.race([apiPromise, timeoutPromise]);
  const latencyMs = Date.now() - start;

  const text         = result.response.text();
  const usage        = result.response.usageMetadata;
  const inputTokens  = usage?.promptTokenCount      ?? 0;
  const outputTokens = usage?.candidatesTokenCount  ?? 0;

  return { text, inputTokens, outputTokens, latencyMs };
}
