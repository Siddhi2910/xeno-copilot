import { computeRFM } from '../services/rfm.service';

// ─── Event-driven RFM recompute job ──────────────────────────────────────────
// Called as a callback after CSV import completes.
// Not scheduled — fired explicitly by import.service.ts.

export async function runRfmComputeJob(): Promise<void> {
  console.log('[rfm] Starting full RFM recompute...');
  const start = Date.now();

  try {
    const { updated, reset } = await computeRFM();
    const ms = Date.now() - start;
    console.log(`[rfm] Recompute complete in ${ms}ms — updated: ${updated}, reset: ${reset}`);
  } catch (err) {
    console.error('[rfm] Recompute failed:', err);
    throw err;
  }
}
