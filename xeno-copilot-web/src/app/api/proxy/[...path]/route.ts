import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { type SessionData, sessionOptions, validateSessionConfig } from '@/lib/auth/session';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

async function requireSession(request: NextRequest): Promise<NextResponse | null> {
  try {
    validateSessionConfig();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server misconfiguration.' },
      { status: 500 },
    );
  }

  const probe = NextResponse.next();
  const session = await getIronSession<SessionData>(request, probe, sessionOptions);

  if (!session.authenticated) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } }, { status: 401 });
  }

  return null;
}

function buildTargetUrl(baseUrl: string, pathSegments: string[], search: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const path = pathSegments.join('/');
  const apiPath = path.startsWith('api/v1/') ? path : `api/v1/${path}`;
  return `${normalizedBase}/${apiPath}${search}`;
}

async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const authError = await requireSession(request);
  if (authError) return authError;

  const crmApiUrl = process.env.CRM_API_URL;
  const crmApiSecret = process.env.CRM_API_SECRET;

  if (!crmApiUrl || !crmApiSecret) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'CRM proxy is not configured.' } },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  const targetUrl = buildTargetUrl(crmApiUrl, path, request.nextUrl.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set('Authorization', `Bearer ${crmApiSecret}`);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
