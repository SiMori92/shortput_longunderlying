import { hashSync } from "bcryptjs";
import { defineConfig } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3100", channel: "chromium" },
  webServer: { command: process.env.E2E_PRODUCTION === "1" ? "pnpm start --port 3100" : "pnpm dev --port 3100", url: "http://127.0.0.1:3100/api/health", reuseExistingServer: false, env: { APP_ORIGIN: "http://127.0.0.1:3100", AUTH_PASSWORD_HASH: hashSync("playwright-only-password-2026",10), AUTH_USERNAME: "playwright-owner", DATA_DIR: path.resolve(".e2e-data"), SESSION_SECRET: "playwright-only-m5-session-secret-32bytes-minimum" } },
});
