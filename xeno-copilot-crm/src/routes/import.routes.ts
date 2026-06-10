import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { ImportJob } from '../models/ImportJob';
import { processImport } from '../services/import.service';
import { AppError } from '../middleware/errorHandler';
import { decodeCursor, encodeCursor, buildPaginationMeta } from '../lib/pagination';

const router = Router();

// ─── Multer: memory storage, 10 MB limit ─────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'VALIDATION_ERROR', 'File must be a CSV (text/csv).', 'file'));
    }
  },
});

// ─── POST /api/v1/import ─────────────────────────────────────────────────────
// Accepts CSV upload. Returns 202 immediately. Processes in background.

router.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(400, 'VALIDATION_ERROR', 'No file uploaded. Include a CSV file in the "file" field.', 'file');
      }

      const type = (req.body.type ?? '').toUpperCase() as 'CUSTOMERS' | 'ORDERS';
      if (type !== 'CUSTOMERS' && type !== 'ORDERS') {
        throw new AppError(400, 'VALIDATION_ERROR', 'type must be "CUSTOMERS" or "ORDERS".', 'type');
      }

      const job = await ImportJob.create({
        type,
        filename: req.file.originalname,
        status: 'PROCESSING',
        totalRows: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      });

      // Respond 202 immediately, process in background
      res.status(202).json({
        data: {
          _id:            job._id.toString(),
          status:         'PROCESSING',
          type:           job.type,
          filename:       job.filename,
          totalRows:      0,
          imported:       0,
          skipped:        0,
          failed:         0,
          createdAt:      job.createdAt,
        },
      });

      // Fire-and-forget background processing
      const buffer = req.file.buffer;
      const jobId  = job._id;
      setImmediate(() => {
        processImport(jobId, type, buffer).catch((err: Error) => {
          console.error('[import] Background process error:', err.message);
        });
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/import/:jobId ────────────────────────────────────────────────

router.get(
  '/:jobId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = req.params;
      if (!Types.ObjectId.isValid(jobId)) {
        throw new AppError(404, 'NOT_FOUND', `Import job ${jobId} not found.`);
      }

      const job = await ImportJob.findById(jobId).lean();
      if (!job) {
        throw new AppError(404, 'NOT_FOUND', `Import job ${jobId} not found.`);
      }

      res.json({
        data: {
          _id:                  job._id.toString(),
          status:               job.status,
          type:                 job.type,
          filename:             job.filename,
          totalRows:            job.totalRows,
          imported:             job.imported,
          skipped:              job.skipped,
          failed:               job.failed,
          errors:               job.errors,
          rfmRecomputeTriggered: job.status === 'COMPLETED',
          rfmRecomputeStatus:   job.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
          completedAt:          job.completedAt,
          createdAt:            job.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/import ───────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit  = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 200);
      const cursor = req.query.cursor as string | undefined;
      const status = req.query.status as string | undefined;
      const type   = req.query.type   as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = {};
      if (status) filter.status = status;
      if (type)   filter.type   = type.toUpperCase();

      if (cursor) {
        try {
          const lastId = decodeCursor(cursor);
          filter._id = { $lt: new Types.ObjectId(lastId) };
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.', 'cursor');
        }
      }

      const [jobs, total] = await Promise.all([
        ImportJob.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
        ImportJob.estimatedDocumentCount(),
      ]);

      const ids = jobs.map((j) => j._id.toString());

      res.json({
        data:       jobs.map((j) => ({
          _id:         j._id.toString(),
          status:      j.status,
          type:        j.type,
          filename:    j.filename,
          totalRows:   j.totalRows,
          imported:    j.imported,
          skipped:     j.skipped,
          failed:      j.failed,
          completedAt: j.completedAt,
          createdAt:   j.createdAt,
        })),
        pagination: buildPaginationMeta(ids, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
