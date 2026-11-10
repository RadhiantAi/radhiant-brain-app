import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, passcodeRole, SESSION_COOKIE } from '@/lib/auth';
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit';
import { clientRateKey } from '@/lib/client-ip';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // `clientRateKey` prefers x-real-ip (the platform-set connection IP) over
  // x-forwarded-for (client-appendable), so a rotating header cannot mint a
  // fresh bucket per request and walk past the lockout. See src/lib/client-ip.ts.
  const ip = clientRateKey(req.headers);

  const gate = checkRateLimit(ip);
  if (!gate.allowed) {
    console.warn(`[auth] login blocked, rate limit hit for ip=${ip}`);
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } },
    );
  }

  let body: { name?: string; passcode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!body || typeof body.name !== 'string' || typeof body.passcode !== 'string' || body.passcode.length > 1024) {
    return NextResponse.json({ error: 'Name and passcode are both needed.' }, { status: 400 });
  }
  const name = body.name.trim().slice(0, 60);
  const passcode = body.passcode.trim();

  if (!name || !passcode) {
    return NextResponse.json({ error: 'Name and passcode are both needed.' }, { status: 400 });
  }

  const role = await passcodeRole(passcode);
  if (!role) {
    const state = recordFailure(ip);
    // The submitted name is deliberately absent from this line. It is
    // user-supplied (so a newline in it forges log entries) and it is a personal
    // name, which has no business sitting in an operational log. The rate-limit
    // key is enough to correlate attempts, and it is sanitised at source.
    console.warn(`[auth] failed passcode attempt ip=${ip} (${state.failures} recent)`);
    return NextResponse.json({ error: 'That passcode is not recognised.' }, { status: 401 });
  }

  resetRateLimit(ip);
  const token = await createSessionToken(name, role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}
