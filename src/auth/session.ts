import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const SessionSchema = z.strictObject({ user: z.literal("owner"), totp: z.literal(true), exp: z.number().int().positive() });
export const SESSION_COOKIE = "__Host-strategy_session";
/** Signed, expiring owner session. No development bypass. */
export function authenticated(request: Request, now = Date.now()): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return false;
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!cookie || cookie.length > 2048) return false;
  const parts = cookie.split("."); if (parts.length !== 2) return false;
  const [body, signature] = parts as [string, string];
  if (!/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(signature)) return false;
  const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try { const data = SessionSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))); return data.exp * 1000 > now && data.exp * 1000 <= now + 12 * 3600000; }
  catch { return false; }
}
/** APP_ORIGIN is operator-controlled; never trust client-supplied forwarded headers. */
export function sameOrigin(request: Request): boolean {
  const configured = process.env.APP_ORIGIN;
  const url = new URL(request.url);
  return request.headers.get("origin") === (configured ?? `${url.protocol}//${request.headers.get("host") ?? url.host}`);
}
export function issueSession(now = Date.now()): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Session signing is not configured");
  const body = Buffer.from(JSON.stringify(SessionSchema.parse({ user: "owner", totp: true, exp: Math.floor(now / 1000) + 12 * 3600 }))).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export const sessionCookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 12 * 3600 };
