import type { SessionOptions } from 'iron-session';

export interface SessionData {
  authenticated?: boolean;
}

export const defaultSession: SessionData = {
  authenticated: false,
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? '',
  cookieName: 'xeno-copilot-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  },
};

export function validateSessionConfig(): void {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters.');
  }
}
