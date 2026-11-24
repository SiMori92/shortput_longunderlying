import { createHmac } from "node:crypto";
import { test as base, expect } from "@playwright/test";
// Regression fixtures exercise dashboard UI; auth.spec.ts separately exercises real login/cookies.
export function regressionCookie() {
  const body = Buffer.from(JSON.stringify({ user: "owner", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  const signature = createHmac("sha256", "playwright-only-m5-session-secret-32bytes-minimum").update(body).digest("base64url");
  return `__Host-strategy_session=${body}.${signature}`;
}
export const test = base.extend({ context: async ({ context }, runTest) => {
  await context.setExtraHTTPHeaders({ Cookie: regressionCookie() });
  await runTest(context);
} });
export { expect };
