// Client key derivation for rate-limit subjects, and log sanitising.
//
// Header precedence matters. On Vercel `x-real-ip` is the platform-set
// connection IP and is not client-spoofable; `x-forwarded-for` is appended to by
// the client and its leading positions are attacker-controlled. Reading
// `x-forwarded-for` first hands an attacker a fresh rate-limit bucket on every
// request, so the eight-failure lockout never fires. This mirrors anith-hub's
// `clientRateKey` (lib/rate-limit.js), which prefers `x-real-ip` for the same
// reason and keeps `x-forwarded-for` only as the fallback for other fronts.
//
// Never used for authorisation, only to stop one source draining a shared
// pre-auth bucket.

const CLIENT_KEY_MAX = 100;

export interface HeaderSource {
  get(name: string): string | null;
}

export function clientRateKey(headers: HeaderSource): string {
  const realIp = (headers.get('x-real-ip') ?? '').trim();
  const forwarded = (headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
  const source = realIp || forwarded;
  return source ? sanitiseForLog(source).slice(0, CLIENT_KEY_MAX) : 'no-client-ip';
}

// Strip anything that could forge a log line (CR/LF, control characters, ANSI
// escape introducers) and cap the length. Header values and form fields are
// user-supplied, so nothing reaches a log line without passing through here.
// Written as a code-point scan rather than a regex range so the control
// characters it guards against never appear in this source file.
export function sanitiseForLog(value: string, maxLength = 100): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    out += isControl ? ' ' : ch;
  }
  const stripped = out.replace(/\s+/g, ' ').trim();
  return stripped.length > maxLength ? `${stripped.slice(0, maxLength)}...` : stripped;
}
