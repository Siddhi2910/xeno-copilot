export const THINKING_COPY = {
  intent: ['Reading your goal...', 'Identifying intent...', 'Matching audience criteria...'],
  preview: ['Scanning your customer base...', 'Calculating channel reach...', 'Estimating revenue impact...'],
  generate: ['Assigning clusters...', 'Writing WhatsApp messages...', 'Writing email subjects...', 'Validating message quality...'],
  critique: ['Reviewing for quality signals...', 'Checking tone consistency...', 'Applying refinements...'],
} as const;

export const REFINE_PLACEHOLDERS: Record<string, string> = {
  WIN_BACK_DORMANT: 'Make it warmer, or add urgency...',
  REWARD_TOP_SPENDERS: 'Make it more exclusive and premium...',
  RE_ENGAGE_SINGLE_PURCHASE: 'Remind them what they ordered before...',
  UPSELL_CATEGORY: 'Highlight the product category benefits...',
  VIP_LOYALTY: 'Emphasize loyalty rewards and exclusivity...',
};
