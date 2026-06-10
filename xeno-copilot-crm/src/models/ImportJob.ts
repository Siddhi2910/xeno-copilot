import { Schema, model, Types } from 'mongoose';

// ─── TypeScript interfaces ────────────────────────────────────────────────────

export interface IImportError {
  row: number;
  field: string;
  value: string;
  reason: string;
}

export interface IImportJob {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  type: 'CUSTOMERS' | 'ORDERS';
  filename: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: IImportError[];   // capped at 50 entries
  createdAt: Date;
  completedAt: Date | null;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ImportErrorSchema = new Schema<IImportError>(
  {
    row:    { type: Number, required: true },
    field:  { type: String, required: true },
    value:  { type: String, required: true, maxlength: 100 },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const ImportJobSchema = new Schema<IImportJob>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    type: {
      type: String,
      required: [true, 'type is required'],
      enum: { values: ['CUSTOMERS', 'ORDERS'], message: 'type must be CUSTOMERS or ORDERS' },
    },

    filename: { type: String, required: [true, 'filename is required'], trim: true },

    status: {
      type: String,
      required: [true, 'status is required'],
      enum: { values: ['PROCESSING', 'COMPLETED', 'FAILED'], message: 'invalid status' },
      default: 'PROCESSING',
    },

    totalRows: { type: Number, default: 0, min: [0, 'totalRows must be ≥ 0'] },
    imported:  { type: Number, default: 0, min: [0, 'imported must be ≥ 0'] },
    skipped:   { type: Number, default: 0, min: [0, 'skipped must be ≥ 0'] },
    failed:    { type: Number, default: 0, min: [0, 'failed must be ≥ 0'] },

    // Max 50 error entries — additional errors are counted in `failed` but not stored
    errors: {
      type: [ImportErrorSchema],
      default: [],
      validate: {
        validator: (arr: IImportError[]) => arr.length <= 50,
        message: 'errors array is capped at 50 entries',
      },
    },

    createdAt:   { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
  },
  { collection: 'import_jobs', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

ImportJobSchema.index({ status: 1, createdAt: -1 });  // compound: import history list
ImportJobSchema.index({ createdAt: -1 });              // recent imports

export const ImportJob = model<IImportJob>('ImportJob', ImportJobSchema);
