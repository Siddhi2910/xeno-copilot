import { parse } from 'csv-parse/sync';
import { Types } from 'mongoose';
import { Customer } from '../models/Customer';
import { Order } from '../models/Order';
import { ImportJob, type IImportError } from '../models/ImportJob';
import { runRfmComputeJob } from '../jobs/rfmCompute.job';

// ─── CSV column definitions ───────────────────────────────────────────────────

interface CustomerCsvRow {
  phone?: string;
  name?: string;
  email?: string;
  tags?: string;
}

interface OrderCsvRow {
  phone?: string;
  orderId?: string;
  amount?: string;
  productCategory?: string;
  orderDate?: string;
  channel?: string;
  discountApplied?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const E164_RE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ORDER_DATE = new Date('2010-01-01');

function normalizePhone(raw: string): string | null {
  // Accept bare 10-digit Indian numbers and prepend +91
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (E164_RE.test(cleaned)) return cleaned;
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
  return null;
}

function addError(
  errors: IImportError[],
  row: number,
  field: string,
  value: string,
  reason: string
): void {
  if (errors.length < 50) {
    errors.push({ row, field, value: value.slice(0, 100), reason });
  }
}

// ─── Customer CSV processing ──────────────────────────────────────────────────

async function processCustomerCsv(
  jobId: Types.ObjectId,
  rows: CustomerCsvRow[]
): Promise<void> {
  const errors: IImportError[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const totalRows = rows.length;

  // 1. Validate and collect valid phones
  interface ValidRow {
    rowNum: number;
    phone: string;
    name: string;
    email: string | null;
    tags: string[];
  }
  const valid: ValidRow[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, header = row 1
    const rawPhone = row.phone ?? '';
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      addError(errors, rowNum, 'phone', rawPhone, `Invalid phone format. Expected E.164 (+91XXXXXXXXXX).`);
      failed++;
      return;
    }

    const name = (row.name ?? '').trim();
    if (!name) {
      addError(errors, rowNum, 'name', '', 'name is required.');
      failed++;
      return;
    }

    const emailRaw = (row.email ?? '').trim().toLowerCase();
    const email = emailRaw === '' ? null : emailRaw;
    if (email && !EMAIL_RE.test(email)) {
      addError(errors, rowNum, 'email', email, 'Invalid email format.');
      failed++;
      return;
    }

    const tagsRaw = (row.tags ?? '').trim();
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20)
      : [];

    valid.push({ rowNum, phone, name, email, tags });
  });

  // 2. Check existing phones in one query
  const phones = valid.map((r) => r.phone);
  const existing = await Customer.find({ phone: { $in: phones } }, { phone: 1 }).lean();
  const existingPhones = new Set(existing.map((c) => c.phone));

  const toInsert = valid.filter((r) => {
    if (existingPhones.has(r.phone)) {
      skipped++;
      return false;
    }
    return true;
  });

  // 3. BulkWrite inserts
  if (toInsert.length > 0) {
    const ops = toInsert.map((r) => ({
      insertOne: {
        document: {
          brandId: null,
          phone: r.phone,
          name: r.name,
          email: r.email,
          source: 'CSV' as const,
          tags: r.tags,
          optOutChannels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          lastOrderAt: null,
          totalOrders: 0,
          totalSpend: 0,
          rfmR: null,
          rfmF: null,
          rfmM: null,
          rfmSegment: null,
        },
      },
    }));

    try {
      await Customer.bulkWrite(ops, { ordered: false });
      imported = toInsert.length;
    } catch (bulkErr: unknown) {
      // Only handle partial-insert BulkWriteErrors (duplicate key etc).
      // Any other error (network, connection) is rethrown so the outer
      // catch in processImport marks the job FAILED instead of COMPLETED.
      const writeErr = bulkErr as { writeErrors?: Array<{ index: number; errmsg: string }> };
      if (writeErr.writeErrors) {
        const failedIndices = new Set(writeErr.writeErrors.map((e) => e.index));
        imported = ops.length - failedIndices.size;
        failed += failedIndices.size;
        writeErr.writeErrors.forEach((e) => {
          const row = toInsert[e.index];
          addError(errors, row.rowNum, 'phone', row.phone, `Duplicate phone number: '${row.phone}' already exists.`);
        });
      } else {
        throw bulkErr;
      }
    }
  }

  // 4. Update ImportJob
  await ImportJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'COMPLETED',
        totalRows,
        imported,
        skipped,
        failed,
        errors,
        completedAt: new Date(),
      },
    }
  );

  // 5. Trigger RFM recompute only if rows were actually inserted
  if (imported > 0) {
    await runRfmComputeJob();
  }
}

// ─── Order CSV processing ─────────────────────────────────────────────────────

async function processOrderCsv(
  jobId: Types.ObjectId,
  rows: OrderCsvRow[]
): Promise<void> {
  const errors: IImportError[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const totalRows = rows.length;

  // 1. Validate rows
  interface ValidOrderRow {
    rowNum: number;
    phone: string;
    orderId: string;
    amount: number;
    productCategory: string | null;
    orderDate: Date;
    channel: 'ONLINE' | 'OFFLINE';
    discountApplied: boolean;
  }
  const valid: ValidOrderRow[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;

    const rawPhone = row.phone ?? '';
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      addError(errors, rowNum, 'phone', rawPhone, 'Invalid phone format.');
      failed++;
      return;
    }

    const orderId = (row.orderId ?? '').trim();
    if (!orderId) {
      addError(errors, rowNum, 'orderId', '', 'orderId is required.');
      failed++;
      return;
    }
    if (orderId.length > 100) {
      addError(errors, rowNum, 'orderId', orderId, 'orderId must be ≤ 100 characters.');
      failed++;
      return;
    }

    const amountRaw = (row.amount ?? '').trim();
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount < 0) {
      addError(errors, rowNum, 'amount', amountRaw, 'amount must be a non-negative number.');
      failed++;
      return;
    }

    const channelRaw = (row.channel ?? '').trim().toUpperCase();
    if (channelRaw !== 'ONLINE' && channelRaw !== 'OFFLINE') {
      addError(errors, rowNum, 'channel', channelRaw, 'channel must be ONLINE or OFFLINE.');
      failed++;
      return;
    }

    const orderDateRaw = (row.orderDate ?? '').trim();
    const orderDate = new Date(orderDateRaw);
    if (isNaN(orderDate.getTime())) {
      addError(errors, rowNum, 'orderDate', orderDateRaw, 'Invalid date format. Use YYYY-MM-DD.');
      failed++;
      return;
    }
    if (orderDate > new Date()) {
      addError(errors, rowNum, 'orderDate', orderDateRaw, 'orderDate must not be in the future.');
      failed++;
      return;
    }
    if (orderDate < MIN_ORDER_DATE) {
      addError(errors, rowNum, 'orderDate', orderDateRaw, 'orderDate must not be before 2010-01-01.');
      failed++;
      return;
    }

    const discountApplied = (row.discountApplied ?? 'false').toLowerCase() === 'true';
    const productCategory = (row.productCategory ?? '').trim() || null;

    valid.push({
      rowNum,
      phone,
      orderId,
      amount,
      productCategory,
      orderDate,
      channel: channelRaw as 'ONLINE' | 'OFFLINE',
      discountApplied,
    });
  });

  // 2. Look up customers by phone (one query)
  const phones = [...new Set(valid.map((r) => r.phone))];
  const customers = await Customer.find({ phone: { $in: phones } }, { _id: 1, phone: 1 }).lean();
  const phoneToId = new Map(customers.map((c) => [c.phone, c._id]));

  // 3. Resolve customerId + filter out unknown phones + check existing orderIds
  const orderIds = valid.map((r) => r.orderId);
  const existingOrders = await Order.find({ orderId: { $in: orderIds } }, { orderId: 1 }).lean();
  const existingOrderIds = new Set(existingOrders.map((o) => o.orderId));

  interface ResolvedRow extends ValidOrderRow {
    customerId: Types.ObjectId;
    customerPhone: string;
  }
  const resolved: ResolvedRow[] = [];

  for (const row of valid) {
    const customerId = phoneToId.get(row.phone);
    if (!customerId) {
      addError(errors, row.rowNum, 'phone', row.phone, `Customer with phone '${row.phone}' not found. Import customers first.`);
      failed++;
      continue;
    }
    if (existingOrderIds.has(row.orderId)) {
      skipped++;
      continue;
    }
    resolved.push({ ...row, customerId: customerId as Types.ObjectId, customerPhone: row.phone });
  }

  // 4. BulkWrite inserts
  if (resolved.length > 0) {
    const ops = resolved.map((r) => ({
      insertOne: {
        document: {
          brandId: null,
          orderId: r.orderId,
          customerId: r.customerId,
          customerPhone: r.customerPhone,
          amount: r.amount,
          productCategory: r.productCategory,
          orderDate: r.orderDate,
          channel: r.channel,
          discountApplied: r.discountApplied,
          campaignAttributedTo: null,
          createdAt: new Date(),
        },
      },
    }));

    try {
      await Order.bulkWrite(ops, { ordered: false });
      imported = resolved.length;
    } catch (bulkErr: unknown) {
      // Only handle partial-insert BulkWriteErrors; rethrow everything else.
      const writeErr = bulkErr as { writeErrors?: Array<{ index: number }> };
      if (writeErr.writeErrors) {
        const failedCount = writeErr.writeErrors.length;
        imported = ops.length - failedCount;
        failed += failedCount;
        writeErr.writeErrors.forEach((e) => {
          const row = resolved[e.index];
          addError(errors, row.rowNum, 'orderId', row.orderId, `Duplicate orderId: '${row.orderId}'.`);
        });
      } else {
        throw bulkErr;
      }
    }
  }

  // 5. Update ImportJob
  await ImportJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'COMPLETED',
        totalRows,
        imported,
        skipped,
        failed,
        errors,
        completedAt: new Date(),
      },
    }
  );

  // 6. Trigger RFM recompute only if rows were actually inserted
  if (imported > 0) {
    await runRfmComputeJob();
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function processImport(
  jobId: Types.ObjectId,
  type: 'CUSTOMERS' | 'ORDERS',
  fileBuffer: Buffer
): Promise<void> {
  try {
    const rows = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as CustomerCsvRow[] | OrderCsvRow[];

    if (type === 'CUSTOMERS') {
      await processCustomerCsv(jobId, rows as CustomerCsvRow[]);
    } else {
      await processOrderCsv(jobId, rows as OrderCsvRow[]);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during CSV processing.';
    await ImportJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'FAILED',
          errors: [{ row: 0, field: 'file', value: '', reason: message }],
          completedAt: new Date(),
        },
      }
    );
    console.error('[import] processImport failed:', err);
  }
}
