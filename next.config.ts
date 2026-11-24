import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, output: "standalone", outputFileTracingExcludes: { "/*": ["./data/**/*", "./.e2e-data/**/*", "./tests/**/*", "./reports/**/*", "./.auth-setup/**/*", "./.env*"] }, experimental: { turbopackFileSystemCacheForDev: false },
  // The SPAX tab became the ticker-aware Monitor page. Redirecting here (not in a page) keeps a real 307:
  // the (dashboard) loading boundary streams pages, so an in-page redirect() would arrive after a 200.
  async redirects() { return [{ source: "/spax", destination: "/monitor", permanent: false }]; } };
export default config;
