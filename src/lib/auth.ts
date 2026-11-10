// Session + role handling. Web Crypto only, so it runs in both the Node
// runtime (API routes) and the Edge runtime (middleware).

export type Role = 'team' | 'leadership' | 'ceo';

export interface Session {
  name: string;
  role: Role;
  iat: number;
  exp: number;
}

export const ROLE_RANK: Record<Role, number> = {
  team: 1,
  leadership: 2,
  ceo: 3,
};

export const ROLE_LABEL: Record<Role, string> = {
  team: 'Team',
  leadership: 'Leadership',
  ceo: 'CEO',
};

export const SESSION_COOKIE = 'rb_session';
const SESSION_DAYS = 14;

// Fail-closed credential handling.
//
// There are NO hardcoded fallback secret or passcodes any more: committing a
// signing key or working passcode means anyone who reads the repo can forge a
// CEO session offline, so those strings are treated as burned and were removed.
// Every required credential must be supplied through the environment. If any is
// unset or still a placeholder the app refuses to operate (in every environment,
// not just production), so it can never silently fall open.
const REQUIRED_ENV_VARS = [
  'RB_SESSION_SECRET',
  'RB_TEAM_PASSCODE',
  'RB_LEADERSHIP_PASSCODE',
  'RB_CEO_PASSCODE',
] as const;

function isPlaceholder(v: string | undefined): boolean {
  return !v || v.trim() === '' || v.includes('PLACEHOLDER');
}

function requiredEnv(name: (typeof REQUIRED_ENV_VARS)[number]): string {
  const v = process.env[name];
  if (isPlaceholder(v)) {
    throw new Error(
      `[radhiant-brain] ${name} is not set (or is still a placeholder). ` +
        `Set every one of ${REQUIRED_ENV_VARS.join(', ')} to real values before running. ` +
        `See .env.example and GO-LIVE.md. The app fails closed rather than use a built-in credential.`,
    );
  }
  return v as string;
}

export function getSecret(): string {
  return requiredEnv('RB_SESSION_SECRET');
}

// True while any required credential is still a placeholder. The app will not
// actually serve traffic in that state (requiredEnv throws first); this only
// exists so admin/config surfaces can describe the misconfiguration.
export function usingDevSecret(): boolean {
  return isPlaceholder(process.env.RB_SESSION_SECRET);
}

export async function passcodeRole(passcode: string): Promise<Role | null> {
  const team = requiredEnv('RB_TEAM_PASSCODE');
  const leadership = requiredEnv('RB_LEADERSHIP_PASSCODE');
  const ceo = requiredEnv('RB_CEO_PASSCODE');

  // Constant-time comparison over SHA-256 digests, so passcode checking does not
  // leak match position through timing. Highest tier wins on the (accidental)
  // event two tiers share a passcode.
  const given = await sha256(passcode);
  if (timingSafeEqual(given, await sha256(ceo))) return 'ceo';
  if (timingSafeEqual(given, await sha256(leadership))) return 'leadership';
  if (timingSafeEqual(given, await sha256(team))) return 'team';
  return null;
}

export function usingDevPasscodes(): boolean {
  return (
    isPlaceholder(process.env.RB_TEAM_PASSCODE) ||
    isPlaceholder(process.env.RB_LEADERSHIP_PASSCODE) ||
    isPlaceholder(process.env.RB_CEO_PASSCODE)
  );
}

// ── Signing ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

// Constant-time equality. Both inputs are fixed-length SHA-256 digests, so the
// length check never short-circuits on a real comparison.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionToken(name: string, role: Role): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Session = {
    name,
    role,
    iat: now,
    exp: now + SESSION_DAYS * 24 * 60 * 60,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 8192) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Session;
    if (typeof payload?.name !== 'string' || !payload.name.trim() || payload.name.length > 60) return null;
    if (!Object.hasOwn(ROLE_RANK, payload.role)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat)) return null;
    if (payload.exp <= now || payload.iat > now || payload.exp <= payload.iat) return null;
    if (payload.exp - payload.iat > SESSION_DAYS * 86400) return null;
    return payload;
  } catch {
    return null;
  }
}

export function canSee(userRole: Role, docAudience: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[docAudience];
}
