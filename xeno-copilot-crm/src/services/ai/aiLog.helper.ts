/**
 * aiLog.helper.ts
 *
 * Shared helper that persists one AiLog document after every Gemini call.
 * Called by every AI service — never called directly from routes.
 *
 * Failures are swallowed (console.error + continue) so a logging failure
 * never breaks the user-facing request.
 */

import { Types } from 'mongoose';
import { AiLog, type AiCallType } from '../../models/AiLog';
import { estimateCostUsd, type GeminiModel } from '../../config/gemini';

export async function saveAiLog(opts: {
  campaignId?:   Types.ObjectId | null;
  callType:      AiCallType;
  model:         GeminiModel;
  promptHash:    string;
  attemptNumber: number;
  latencyMs:     number;
  inputTokens:   number;
  outputTokens:  number;
  success:       boolean;
  errorMessage?: string;
}): Promise<Types.ObjectId | null> {
  try {
    const doc = await AiLog.create({
      campaignId:       opts.campaignId ?? null,
      callType:         opts.callType,
      model:            opts.model,
      promptHash:       opts.promptHash,
      attemptNumber:    opts.attemptNumber,
      latencyMs:        opts.latencyMs,
      inputTokens:      opts.inputTokens,
      outputTokens:     opts.outputTokens,
      estimatedCostUsd: estimateCostUsd(opts.model, opts.inputTokens, opts.outputTokens),
      success:          opts.success,
      errorMessage:     opts.errorMessage ?? null,
    });
    return doc._id;
  } catch (logErr) {
    console.error('[aiLog] Failed to save AiLog:', logErr);
    return null;
  }
}
