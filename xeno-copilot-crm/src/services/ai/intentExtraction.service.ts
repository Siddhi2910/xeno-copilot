/**
 * intentExtraction.service.ts — Call 1
 *
 * Classifies the marketer's free-text goal into a structured intent.
 *
 * Security:
 * - LLM output is validated against the INTENT_TYPE_SET whitelist before use.
 * - Parameters are checked for $ keys (MongoDB injection guard).
 * - LLM never constructs or sees MongoDB queries.
 *
 * Retry: on JSON parse failure → retry once at temperature 0.
 * Timeout: 5 000 ms (AI_FEATURES.md §11 Call 1).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';
import { callGemini } from '../../config/gemini';
import { stripMarkdownFences } from '../../lib/stripMarkdownFences';
import { sha256Hex } from '../../lib/crypto';
import { AppError } from '../../middleware/errorHandler';
import { INTENT_TYPE_SET } from '../audience.service';
import { saveAiLog } from './aiLog.helper';

// ─── Prompt template ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../../prompts/intent-v1.txt'),
  'utf8',
);

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface IntentExtractionResult {
  intentType:       string | null;   // null means ambiguous goal
  parameters:       Record<string, unknown>;
  confirmationText: string;
  suggestedName:    string | null;
  aiLogId:          string | null;
}

// ─── $ key guard ─────────────────────────────────────────────────────────────
// Recursively reject any key starting with '$' in LLM output parameters.
// Prevents MongoDB injection if the LLM ever outputs an operator.

function rejectDollarKeys(obj: Record<string, unknown>, path_ = 'parameters'): void {
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) {
      throw new AppError(
        422,
        'UNPROCESSABLE',
        `LLM returned a MongoDB operator in parameters ('${path_}.${key}'). Request rejected.`,
        path_,
      );
    }
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      rejectDollarKeys(val as Record<string, unknown>, `${path_}.${key}`);
    }
  }
}

// ─── Schema validation ────────────────────────────────────────────────────────

interface LlmIntentOutput {
  intent_type:       unknown;
  parameters:        unknown;
  confirmation_text: unknown;
  suggested_name:    unknown;
}

function validateLlmOutput(raw: unknown): LlmIntentOutput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('LLM output is not an object');
  }
  const obj = raw as Record<string, unknown>;
  if (!('intent_type' in obj) || !('parameters' in obj) || !('confirmation_text' in obj)) {
    throw new Error('LLM output missing required fields: intent_type, parameters, confirmation_text');
  }
  if (typeof obj.confirmation_text !== 'string') {
    throw new Error('confirmation_text must be a string');
  }
  if (obj.parameters !== null && (typeof obj.parameters !== 'object' || Array.isArray(obj.parameters))) {
    throw new Error('parameters must be an object or null');
  }
  return obj as unknown as LlmIntentOutput;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const MODEL       = 'gemini-1.5-flash' as const;
const TEMPERATURE = 0.1;
const MAX_TOKENS  = 256;
const TIMEOUT_MS  = 5_000;

export async function extractIntent(
  goalText:   string,
  brandName:  string = 'Your Brand',
  industry:   string = 'retail',
  totalCustomers: number = 0,
  campaignId?: Types.ObjectId | null,
): Promise<IntentExtractionResult> {

  const systemPrompt = SYSTEM_PROMPT.replace('{brandName}', brandName);

  const userPrompt = [
    `Brand: ${brandName} (${industry})`,
    `Total customers: ${totalCustomers}`,
    ``,
    `Marketer's goal: "${goalText}"`,
    ``,
    `Classify and confirm.`,
  ].join('\n');

  const promptHash = sha256Hex(systemPrompt + '\n---\n' + userPrompt);

  // ── Attempt 1 ──────────────────────────────────────────────────────────────

  let attempt = 1;
  let result: IntentExtractionResult | null = null;
  let lastError: string | null = null;

  for (; attempt <= 2; attempt++) {
    const temperature = attempt === 1 ? TEMPERATURE : 0;  // retry at temp 0 on parse failure

    let llmText   = '';
    let inputTok  = 0;
    let outputTok = 0;
    let latencyMs = 0;
    let success   = false;
    let errorMsg: string | null = null;

    try {
      const raw = await callGemini({
        model:           MODEL,
        systemPrompt,
        userPrompt,
        temperature,
        maxOutputTokens: MAX_TOKENS,
        timeoutMs:       TIMEOUT_MS,
      });
      llmText   = raw.text;
      inputTok  = raw.inputTokens;
      outputTok = raw.outputTokens;
      latencyMs = raw.latencyMs;

      // Parse + validate
      const parsed   = JSON.parse(stripMarkdownFences(llmText));
      const validated = validateLlmOutput(parsed);

      // Whitelist check
      const intentType = validated.intent_type as string | null;
      if (intentType !== null && !INTENT_TYPE_SET.has(intentType)) {
        throw new AppError(
          422,
          'UNPROCESSABLE',
          `AI returned an unrecognised intent type: '${intentType}'. Please rephrase your goal.`,
        );
      }

      // Security: reject $ keys in parameters
      const params = (validated.parameters ?? {}) as Record<string, unknown>;
      rejectDollarKeys(params);

      success = true;
      const aiLogId = await saveAiLog({
        campaignId:    campaignId ?? null,
        callType:      'INTENT',
        model:         MODEL,
        promptHash,
        attemptNumber: attempt,
        latencyMs,
        inputTokens:   inputTok,
        outputTokens:  outputTok,
        success:       true,
      });

      result = {
        intentType,
        parameters:       params,
        confirmationText: String(validated.confirmation_text),
        suggestedName:    validated.suggested_name != null ? String(validated.suggested_name) : null,
        aiLogId:          aiLogId?.toHexString() ?? null,
      };

      void success; // suppress unused lint
      break;

    } catch (err) {
      const isAppError = err instanceof AppError;
      errorMsg  = err instanceof Error ? err.message : String(err);
      lastError = errorMsg;

      await saveAiLog({
        campaignId:    campaignId ?? null,
        callType:      'INTENT',
        model:         MODEL,
        promptHash,
        attemptNumber: attempt,
        latencyMs,
        inputTokens:   inputTok,
        outputTokens:  outputTok,
        success:       false,
        errorMessage:  errorMsg,
      });

      // Don't retry AppErrors (whitelist miss, injection, timeout) — propagate immediately
      if (isAppError) throw err;

      // Only retry JSON parse errors; if on last attempt, fall through to throw
      if (attempt >= 2) {
        throw new AppError(502, 'AI_UNAVAILABLE', 'AI returned invalid JSON after retry. Please try again.');
      }
      // else: loop continues with temperature 0
    }
  }

  if (!result) {
    throw new AppError(502, 'AI_UNAVAILABLE', lastError ?? 'Intent extraction failed.');
  }

  return result;
}
