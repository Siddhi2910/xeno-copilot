import { Schema, model, Types } from 'mongoose';

// ─── Shared enum constants (also used by services and seed script) ────────────

export const RFM_SEGMENTS = [
  'CHAMPIONS',
  'PROMISING',
  'AT_RISK_LOYALISTS',
  'DORMANT_VIPS',
  'LAPSED_LOW_VALUE',
  'GENERAL',
] as const;

export type RfmSegment = (typeof RFM_SEGMENTS)[number];

export const CHANNELS = ['WHATSAPP', 'EMAIL', 'SMS'] as const;
export type Channel = (typeof CHANNELS)[number];

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface ICustomer {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  phone: string;
  name: string;
  email: string | null;
  source: 'CSV' | 'API';
  tags: string[];
  optOutChannels: Channel[];
  createdAt: Date;
  updatedAt: Date;
  // Computed by RFM job — null until first computation
  lastOrderAt: Date | null;
  totalOrders: number;
  totalSpend: number;
  rfmR: number | null;
  rfmF: number | null;
  rfmM: number | null;
  rfmSegment: RfmSegment | null;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const rfmScoreValidator = {
  validator: (v: number | null): boolean =>
    v === null || (Number.isInteger(v) && v >= 1 && v <= 5),
  message: '{PATH} must be an integer 1–5 or null',
};

const CustomerSchema = new Schema<ICustomer>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    phone: {
      type: String,
      required: [true, 'phone is required'],
      trim: true,
      validate: {
        validator: (v: string) => /^\+[1-9]\d{7,14}$/.test(v),
        message: 'phone must be E.164 format (e.g. +919876543210)',
      },
    },

    name: { type: String, required: [true, 'name is required'], trim: true },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v: string | null) => {
          if (!v) return true;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'email is not a valid address',
      },
    },

    source: {
      type: String,
      required: [true, 'source is required'],
      enum: { values: ['CSV', 'API'], message: 'source must be CSV or API' },
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) =>
          arr.length <= 20 && arr.every((t) => t.length <= 50),
        message: 'tags: max 20 items; each tag ≤ 50 characters',
      },
    },

    optOutChannels: {
      type: [String],
      enum: { values: CHANNELS as unknown as string[], message: 'invalid channel in optOutChannels' },
      default: [],
    },

    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },

    // RFM computed fields ─────────────────────────────────────────────────────
    lastOrderAt:  { type: Date, default: null },
    totalOrders:  { type: Number, default: 0, min: [0, 'totalOrders must be ≥ 0'] },
    totalSpend:   { type: Number, default: 0, min: [0, 'totalSpend must be ≥ 0'] },
    rfmR:         { type: Number, default: null, validate: rfmScoreValidator },
    rfmF:         { type: Number, default: null, validate: rfmScoreValidator },
    rfmM:         { type: Number, default: null, validate: rfmScoreValidator },
    rfmSegment:   {
      type: String,
      default: null,
      enum: { values: [...RFM_SEGMENTS, null] as string[], message: 'invalid rfmSegment' },
    },
  },
  { collection: 'customers', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

CustomerSchema.index({ phone: 1 }, { unique: true });
CustomerSchema.index({ lastOrderAt: 1 });
CustomerSchema.index({ rfmSegment: 1 });
CustomerSchema.index({ lastOrderAt: 1, totalOrders: 1 });              // compound: WIN_BACK queries
CustomerSchema.index({ rfmSegment: 1, lastOrderAt: 1 });               // compound: AT_RISK recency
CustomerSchema.index({ email: 1 }, { sparse: true });

export const Customer = model<ICustomer>('Customer', CustomerSchema);
