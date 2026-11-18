import { NextResponse } from "next/server";
import { AuthResponseSchema, LoginInputSchema, login } from "@/auth/login";
import { issueSession, sameOrigin, SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function reply(status: number, message: string) { return NextResponse.json(AuthResponseSchema.parse({ ok: status === 200, message }), { status, headers }); }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply(403, "Same-origin request required");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, "JSON required");
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "Invalid login");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); return reply(413, "Request too large"); } chunks.push(value); }
    const input = LoginInputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!input.success) return reply(400, "Enter your account name and password");
    const result = await login(input.data);
    const response = reply(result.status, result.message);
    if (result.retryAfter) response.headers.set("Retry-After", String(result.retryAfter));
    if (result.status === 200) response.cookies.set(SESSION_COOKIE, issueSession(), sessionCookieOptions);
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return reply(400, "Invalid JSON");
    console.error("[auth] Login unavailable"); // no input or secrets in logs
    return reply(503, "Login unavailable. Check server configuration and auth storage.");
  }
}
