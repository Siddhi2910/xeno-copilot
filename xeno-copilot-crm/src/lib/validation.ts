import { z } from 'zod';

// ─── Intent extraction ────────────────────────────────────────────────────────

export const IntentExtractSchema = z.object({
  goalText: z.string().min(5, 'goalText must be at least 5 characters').max(500),
});

// ─── Audience preview ─────────────────────────────────────────────────────────

const IntentTypeEnum = z.enum([
  'WIN_BACK_DORMANT',
  'REWARD_TOP_SPENDERS',
  'RE_ENGAGE_SINGLE_PURCHASE',
  'UPSELL_CATEGORY',
  'VIP_LOYALTY',
]);

export const AudiencePreviewSchema = z.object({
  goalText: z.string().min(5).max(500),
  intentType: IntentTypeEnum,
  intentParameters: z.record(z.unknown()),
  aiLogId: z.string().optional(),
});

// ─── Campaign refine ──────────────────────────────────────────────────────────

export const CampaignRefineSchema = z.object({
  // Optional — if absent, only the 6 deterministic rules run (no AI tone review)
  userFeedback: z
    .string()
    .max(500)
    .optional()
    .transform((val) => {
      if (!val) return val;
      // Strip prompt injection patterns before passing to AI
      return val
        .replace(/ignore\s+(all\s+)?instructions?/gi, '')
        .replace(/disregard\s+(all\s+)?instructions?/gi, '')
        .replace(/system\s*:/gi, '')
        .trim();
    }),
});

// ─── Campaign launch ──────────────────────────────────────────────────────────

export const CampaignLaunchSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

// ─── Opt-out ──────────────────────────────────────────────────────────────────

const ChannelEnum = z.enum(['WHATSAPP', 'SMS', 'EMAIL']);

export const OptOutSchema = z.object({
  channel:  ChannelEnum,
  optedOut: z.boolean(),
});

// ─── Callback delivery ────────────────────────────────────────────────────────

export const DeliveryCallbackSchema = z.object({
  messageId: z.string().length(24, 'messageId must be a 24-char ObjectId hex string'),
  eventType: z.enum(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED', 'OPT_OUT']),
  timestamp: z.string().datetime(),
  providerId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── Import query params ──────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(parseInt(v ?? '20', 10), 200))
    .pipe(z.number().int().min(1).max(200)),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type IntentExtractInput = z.infer<typeof IntentExtractSchema>;
export type AudiencePreviewInput = z.infer<typeof AudiencePreviewSchema>;
export type CampaignRefineInput = z.infer<typeof CampaignRefineSchema>;
export type CampaignLaunchInput = z.infer<typeof CampaignLaunchSchema>;
export type OptOutInput    = z.infer<typeof OptOutSchema>;
export type DeliveryCallbackInput = z.infer<typeof DeliveryCallbackSchema>;
