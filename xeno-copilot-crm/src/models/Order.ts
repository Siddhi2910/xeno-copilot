import { Schema, model, Types } from 'mongoose';

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface IOrder {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  orderId: string;
  customerId: Types.ObjectId;
  customerPhone: string;    // denormalized for re-ingestion / debugging
  amount: number;
  productCategory: string | null;
  orderDate: Date;
  channel: 'ONLINE' | 'OFFLINE';
  discountApplied: boolean;
  campaignAttributedTo: Types.ObjectId | null;  // set by conversion job
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const MIN_ORDER_DATE = new Date('2010-01-01');

const OrderSchema = new Schema<IOrder>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    orderId: {
      type: String,
      required: [true, 'orderId is required'],
      trim: true,
      maxlength: [100, 'orderId must be ≤ 100 characters'],
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'customerId is required'],
    },

    // Denormalized from customers.phone — kept for ingestion joins and debugging
    customerPhone: {
      type: String,
      required: [true, 'customerPhone is required'],
      trim: true,
    },

    amount: {
      type: Number,
      required: [true, 'amount is required'],
      min: [0, 'amount must be ≥ 0 (returns not supported in V1)'],
    },

    productCategory: {
      type: String,
      default: null,
      maxlength: [100, 'productCategory must be ≤ 100 characters'],
    },

    orderDate: {
      type: Date,
      required: [true, 'orderDate is required'],
      validate: [
        {
          validator: (v: Date) => v <= new Date(),
          message: 'orderDate must not be in the future',
        },
        {
          validator: (v: Date) => v >= MIN_ORDER_DATE,
          message: 'orderDate must not be before 2010-01-01',
        },
      ],
    },

    channel: {
      type: String,
      required: [true, 'channel is required'],
      enum: { values: ['ONLINE', 'OFFLINE'], message: 'channel must be ONLINE or OFFLINE' },
    },

    discountApplied: {
      type: Boolean,
      required: [true, 'discountApplied is required'],
      default: false,
    },

    // null until the conversion detection job attributes this order to a campaign
    campaignAttributedTo: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },

    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'orders', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

OrderSchema.index({ orderId: 1 }, { unique: true });
OrderSchema.index({ customerId: 1 });
OrderSchema.index({ orderDate: 1 });
OrderSchema.index({ customerId: 1, orderDate: -1 });        // compound: customer timeline
OrderSchema.index({ productCategory: 1 });
OrderSchema.index({ campaignAttributedTo: 1 }, { sparse: true }); // sparse: unattributed orders are null

export const Order = model<IOrder>('Order', OrderSchema);
