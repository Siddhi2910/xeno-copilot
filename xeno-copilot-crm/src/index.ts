import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDB } from './config/db';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import healthRouter    from './routes/health.routes';
import importRouter    from './routes/import.routes';
import customersRouter from './routes/customers.routes';
import ordersRouter    from './routes/orders.routes';
import segmentsRouter  from './routes/segments.routes';

// ─── Env validation ───────────────────────────────────────────────────────────
// Fail fast on startup if required variables are missing.
// Add new required vars here as phases are built.

const REQUIRED_ENV: string[] = ['MONGODB_URI', 'API_SECRET_TOKEN'];

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('[startup] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// ─── App setup ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

const app = express();

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Global auth guard — skips /health, /track/click/*, and /callbacks/delivery
app.use(authMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────────
// Skeleton: only /health registered now.
// Additional routers are added in later phases.

app.use('/api/v1', healthRouter);
app.use('/api/v1/import',    importRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/orders',    ordersRouter);
app.use('/api/v1/segments',  segmentsRouter);

// Bare /health alias (Render health check pings this path by default)
app.get('/health', (_req, res) => {
  const { isConnected } = require('./config/db') as { isConnected: () => boolean };
  res.json({ status: isConnected() ? 'ok' : 'degraded' });
});

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
});

// Central error handler (must be last)
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  validateEnv();
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[crm] CRM Service listening on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
  });
}

start().catch((err: Error) => {
  console.error('[crm] Fatal startup error:', err.message);
  process.exit(1);
});
