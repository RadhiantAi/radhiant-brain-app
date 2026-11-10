// Response headers sent on every route. Kept in its own module so the test
// suite can assert them without loading Next.
//
// No script-src policy is set here: Next's inline bootstrap scripts need a
// per-request nonce, which is a larger change. frame-ancestors, base-uri,
// form-action and object-src carry no such cost.
export const securityHeaders = [
  // An internal tool has no reason to be framed; this blocks clickjacking.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Entry slugs and search terms must not leak to an external site through a link.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];
