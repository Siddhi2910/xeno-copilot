import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { safeEqual } from '@/lib/auth/safeEqual';
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

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not configured.' }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const password = body.password ?? '';
  if (!safeEqual(password, adminPassword)) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.authenticated = true;
  await session.save();

  return response;
}
