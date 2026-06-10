import mongoose from 'mongoose';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
  });
  mongoose.connection.on('error', (err: Error) => {
    console.error('[db] MongoDB error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, {
        // Atlas M0 has a 500-connection limit shared across all clients.
        // Two services × maxPoolSize 5 = 10 connections total — well within limits.
        maxPoolSize: 5,
      });
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(
        `[db] Connection attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${RETRY_DELAY_MS}ms…`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export function isConnected(): boolean {
  // readyState 1 === connected
  return mongoose.connection.readyState === 1;
}
