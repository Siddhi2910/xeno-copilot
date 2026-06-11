import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { type SessionData, sessionOptions, validateSessionConfig } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    validateSessionConfig();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server misconfiguration.' },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.destroy();
  return response;
}
