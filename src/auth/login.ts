import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { compare } from "bcryptjs";
import { z } from "zod";
import { atomicWrite, dataRoot, isMissing, readJson } from "../data/store";
import { authConfig } from "./config";
export const LoginInputSchema = z.strictObject({ username: z.string().min(1).max(64), password: z.string().min(1).refine(s => Buffer.byteLength(s, "utf8") <= 72) });
export { AuthResponseSchema } from "../schemas/auth";
// z.object (not strict) so state files written by the earlier TOTP version (with lastStep) still load.
const StateSchema = z.object({ fingerprint: z.string(), windowStart: z.number().int().nonnegative(), attempts: z.number().int().nonnegative() });
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
const WINDOW = 15 * 60_000;
/** Global single-owner limit cannot be bypassed using a forged IP header. State survives restart. */
export async function login(input: z.infer<typeof LoginInputSchema>, root = dataRoot(), now = Date.now()): Promise<{status: number; message: string; retryAfter?: number}> {
  const config = authConfig();
  if (!config) return { status: 503, message: "Authentication is not configured. Run pnpm auth:setup locally." };
  const dir = path.join(root, "auth");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(path.join(dir, ".login.lock"), "wx", 0o600); }
  catch (error) { if (error instanceof Error && "code" in error && error.code === "EEXIST") return { status: 429, message: "Login is busy. Retry shortly.", retryAfter: 2 }; throw error; }
  try {
    const fingerprint = createHash("sha256").update(config.AUTH_PASSWORD_HASH + "\0" + config.AUTH_USERNAME).digest("hex");
    const file = path.join(dir, "login.json");
    let state;
    try { state = await readJson(file, StateSchema); }
    catch (error) { if (!isMissing(error)) throw error; state = { fingerprint, windowStart: now, attempts: 0 }; }
    if (state.fingerprint !== fingerprint) state = { fingerprint, windowStart: now, attempts: 0 };
    if (now - state.windowStart >= WINDOW) state = { ...state, windowStart: now, attempts: 0 };
    if (state.attempts >= 5) return { status: 429, message: "Login limit reached. Try again after the cooldown.", retryAfter: Math.max(1, Math.ceil((state.windowStart + WINDOW - now) / 1000)) };
    state.attempts++;
    await atomicWrite(file, StateSchema, state); // reserve before expensive verification
    const usernameOk = timingSafeEqual(digest(input.username.trim()), digest(config.AUTH_USERNAME));
    const passwordOk = await compare(input.password, config.AUTH_PASSWORD_HASH); // always run bcrypt to keep timing uniform
    if (!usernameOk || !passwordOk) return { status: 401, message: "Account name or password is invalid." };
    await atomicWrite(file, StateSchema, { ...state, attempts: 0 }); // successes do not count toward the lockout
    return { status: 200, message: "Signed in" };
  } finally { await lock.close(); await unlink(path.join(dir, ".login.lock")); }
}
