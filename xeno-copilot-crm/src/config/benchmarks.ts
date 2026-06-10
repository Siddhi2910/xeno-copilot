/**
 * benchmarks.ts
 *
 * Cold-start conversion-rate and engagement benchmarks used when a brand has no
 * campaign history in channel_stats (AI_FEATURES.md §10).
 *
 * Always display the source label alongside any benchmark figure.
 */

export interface Benchmark {
  rate:   number;   // 0–1
  label:  string;   // human-readable display label
  source: string;   // citation
}

// ─── Conversion rate benchmarks ───────────────────────────────────────────────

export const CONVERSION_BENCHMARKS: Record<string, Benchmark> = {
  WIN_BACK: {
    rate:   0.05,
    label:  'based on industry benchmarks (Klaviyo 2024)',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
  REWARD_LOYAL: {
    rate:   0.08,
    label:  'based on industry benchmarks (Klaviyo 2024)',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
  UPSELL: {
    rate:   0.05,
    label:  'based on industry benchmarks (Klaviyo 2024)',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
  CROSS_SELL: {
    rate:   0.05,
    label:  'based on industry benchmarks (Klaviyo 2024)',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
  ANNOUNCEMENT: {
    rate:   0.03,
    label:  'based on industry benchmarks (Klaviyo 2024)',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
  CUSTOM: {
    rate:   0.04,
    label:  'based on industry benchmarks',
    source: 'BENCHMARK_KLAVIYO_2024',
  },
};

// ─── Channel engagement benchmarks ───────────────────────────────────────────

export const CHANNEL_BENCHMARKS = {
  WHATSAPP_OPEN_RATE: {
    rate:   0.65,
    label:  'based on industry benchmarks (Gupshup 2024)',
    source: 'BENCHMARK_GUPSHUP_2024',
  },
  EMAIL_OPEN_RATE: {
    rate:   0.22,
    label:  'based on industry benchmarks (Mailchimp 2024)',
    source: 'BENCHMARK_MAILCHIMP_2024',
  },
  EMAIL_CLICK_RATE: {
    rate:   0.026,
    label:  'based on industry benchmarks (Mailchimp 2024)',
    source: 'BENCHMARK_MAILCHIMP_2024',
  },
} as const;
