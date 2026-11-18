import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, output: "standalone", outputFileTracingExcludes: { "/*": ["./data/**/*", "./.e2e-data/**/*", "./tests/**/*", "./reports/**/*", "./.auth-setup/**/*", "./.env*"] }, experimental: { turbopackFileSystemCacheForDev: false } };
export default config;
