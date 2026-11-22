import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
// Header paintings hotlink Wikimedia; serve the local fallback JPEG so browser tests stay offline and deterministic.
const paintingBytes = readFileSync(path.join(process.cwd(), "public/art/monet-water-lilies.jpg"));
// Regression fixtures exercise dashboard UI; auth.spec.ts separately exercises real login/cookies.
export function regressionCookie() {
  const body = Buffer.from(JSON.stringify({ user: "owner", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  const signature = createHmac("sha256", "playwright-only-m5-session-secret-32bytes-minimum").update(body).digest("base64url");
  return `__Host-strategy_session=${body}.${signature}`;
}
export const test = base.extend({ context: async ({ context }, runTest) => {
  await context.setExtraHTTPHeaders({ Cookie: regressionCookie() });
  await context.route(/^https:\/\/(upload|thumb)\.wikimedia\.org\//, route => route.fulfill({ contentType: "image/jpeg", body: paintingBytes }));
  await runTest(context);
} });
export { expect };
