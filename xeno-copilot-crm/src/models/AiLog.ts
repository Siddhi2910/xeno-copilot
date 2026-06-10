import { Schema, model, Types } from 'mongoose';

// ─── Constants ────────────────────────────────────────────────────────────────

export const AI_CALL_TYPES = [
  'INTENT',
  'AUDIENCE_NARRATIVE',
  'MESSAGE_GEN',
  'CRITIQUE',
  'POST_CAMPAIGN',
] as const;

export type AiCallType = (typeof AI_CALL_TYPES)[number];

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface IAiLog {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  campaignId: Types.ObjectId | null;   // null for calls not tied to a campaign
  callType: AiCallType;
  model: string;
  promptHash: string;                  // SHA256 of the rendered prompt
  attemptNumber: number;               // 1 = first attempt, 2 = retry
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const AiLogSchema = new Schema<IAiLog>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },

    callType: {
      type: String,
      required: [true, 'callType is required'],
      enum: { values: AI_CALL_TYPES as unknown as string[], message: 'invalid callType' },
    },

    model: {
      type: String,
      required: [true, 'model is required'],
      trim: true,
      maxlength: [100, 'model name must be ≤ 100 characters'],
    },

    promptHash: {
      type: String,
      required: [true, 'promptHash is required'],
      trim: true,
    },

    attemptNumber: {
      type: Number,
      required: [true, 'attemptNumber is required'],
      min: [1, 'attemptNumber must be ≥ 1'],
      max: [3, 'attemptNumber must be ≤ 3'],
    },

    latencyMs: {
      type: Number,
      required: [true, 'latencyMs is required'],
      min: [0, 'latencyMs must be ≥ 0'],
    },

    inputTokens: {
      type: Number,
      required: [true, 'inputTokens is required'],
      min: [0, 'inputTokens must be ≥ 0'],
    },

    outputTokens: {
      type: Number,
      required: [true, 'outputTokens is required'],
      min: [0, 'outputTokens must be ≥ 0'],
    },

    estimatedCostUsd: {
      type: Number,
      default: 0,
      min: [0, 'estimatedCostUsd must be ≥ 0'],
    },

    success: { type: Boolean, required: [true, 'success is required'] },

    errorMessage: { type: String, default: null },

    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'ai_logs', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

AiLogSchema.index({ campaignId: 1 });
AiLogSchema.index({ callType: 1, success: 1 });          // compound: failure rate per call type
AiLogSchema.index({ createdAt: -1 });                    // recent calls
AiLogSchema.index({ campaignId: 1, callType: 1 });       // compound: what did Call 3 produce?

export const AiLog = model<IAiLog>('AiLog', AiLogSchema);
