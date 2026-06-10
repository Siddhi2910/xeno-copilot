import { Types } from 'mongoose';
import { Customer, type RfmSegment } from '../models/Customer';
import { Order } from '../models/Order';

// ─── Segment lookup table (priority-ordered) ─────────────────────────────────
// Rules applied in order. First match wins.
// R=3 exactly for AT_RISK_LOYALISTS so R=2 customers go to DORMANT_VIPS instead.

function assignSegment(r: number, f: number, m: number): RfmSegment {
  if (r >= 4 && f >= 4 && m >= 4) return 'CHAMPIONS';
  if (r >= 4 && f >= 2 && m >= 2) return 'PROMISING';
  if (r === 3 && f >= 4 && m >= 4) return 'AT_RISK_LOYALISTS';
  if (r <= 2 && f >= 3 && m >= 3) return 'DORMANT_VIPS';
  if (r <= 2 && f <= 2)            return 'LAPSED_LOW_VALUE';
  return 'GENERAL';
}

// ─── Quintile score: 1 (worst) → 5 (best) ────────────────────────────────────
// Input: 0-indexed rank in a ASCENDING-sorted array where higher index = better.
// Customers at the top of the array (high index) get score 5.

function quintileScore(rank: number, n: number): number {
  return Math.min(5, Math.ceil(((rank + 1) / n) * 5));
}

// ─── Order aggregation result ─────────────────────────────────────────────────

interface CustomerOrderStats {
  _id: Types.ObjectId;
  lastOrderAt: Date;
  totalOrders: number;
  totalSpend: number;
}

// ─── Main compute function ────────────────────────────────────────────────────
// Full recompute of all customer RFM fields.
// Safe to call any time — overwrites existing scores atomically via bulkWrite.

export async function computeRFM(): Promise<{ updated: number; reset: number }> {
  // Step 1: aggregate orders → per-customer stats
  const stats = await Order.aggregate<CustomerOrderStats>([
    {
      $group: {
        _id: '$customerId',
        lastOrderAt: { $max: '$orderDate' },
        totalOrders: { $sum: 1 },
        totalSpend:  { $sum: '$amount' },
      },
    },
  ]);

  const n = stats.length;

  if (n === 0) {
    // No orders at all — reset every customer
    const result = await Customer.updateMany(
      {},
      {
        $set: {
          rfmR: null, rfmF: null, rfmM: null, rfmSegment: null,
          totalOrders: 0, totalSpend: 0, lastOrderAt: null,
          updatedAt: new Date(),
        },
      }
    );
    return { updated: 0, reset: result.modifiedCount };
  }

  // Step 2: Sort arrays (ascending) to compute quintile scores.
  // R: sort ascending by lastOrderAt → oldest first = R=1, most recent last = R=5
  const byRecency  = [...stats].sort((a, b) => a.lastOrderAt.getTime() - b.lastOrderAt.getTime());
  // F: sort ascending by totalOrders → fewest first = F=1
  const byFrequency = [...stats].sort((a, b) => a.totalOrders - b.totalOrders);
  // M: sort ascending by totalSpend → lowest first = M=1
  const byMonetary  = [...stats].sort((a, b) => a.totalSpend - b.totalSpend);

  // Step 3: Build score maps (customerId string → score)
  const rScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const mScore = new Map<string, number>();

  byRecency.forEach((s, i)  => rScore.set(s._id.toString(), quintileScore(i, n)));
  byFrequency.forEach((s, i) => fScore.set(s._id.toString(), quintileScore(i, n)));
  byMonetary.forEach((s, i)  => mScore.set(s._id.toString(), quintileScore(i, n)));

  // Step 4: Build bulkWrite ops for customers WITH orders
  const withOrdersOps = stats.map((s) => {
    const id = s._id.toString();
    const r = rScore.get(id) ?? 1;
    const f = fScore.get(id) ?? 1;
    const m = mScore.get(id) ?? 1;

    return {
      updateOne: {
        filter: { _id: s._id },
        update: {
          $set: {
            rfmR: r,
            rfmF: f,
            rfmM: m,
            rfmSegment: assignSegment(r, f, m),
            lastOrderAt: s.lastOrderAt,
            totalOrders: s.totalOrders,
            totalSpend:  s.totalSpend,
            updatedAt:   new Date(),
          },
        },
      },
    };
  });

  await Customer.bulkWrite(withOrdersOps, { ordered: false });

  // Step 5: Reset customers with no orders (not present in the aggregation)
  const customerIdsWithOrders = stats.map((s) => s._id);
  const resetResult = await Customer.updateMany(
    { _id: { $nin: customerIdsWithOrders } },
    {
      $set: {
        rfmR: null, rfmF: null, rfmM: null, rfmSegment: null,
        totalOrders: 0, totalSpend: 0, lastOrderAt: null,
        updatedAt: new Date(),
      },
    }
  );

  return { updated: withOrdersOps.length, reset: resetResult.modifiedCount };
}
