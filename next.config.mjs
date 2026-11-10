import { securityHeaders } from './security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Knowledge markdown files are read from disk at runtime by the server.
  // outputFileTracingIncludes keeps them in the build output on Vercel/standalone.
  outputFileTracingIncludes: {
    '/**': ['./knowledge/**/*'],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
