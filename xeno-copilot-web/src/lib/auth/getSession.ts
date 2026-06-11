import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import {
  defaultSession,
  type SessionData,
  sessionOptions,
  validateSessionConfig,
} from '@/lib/auth/session';

export async function getSession() {
  validateSessionConfig();
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.authenticated) {
    session.authenticated = defaultSession.authenticated;
  }
  return session;
}
