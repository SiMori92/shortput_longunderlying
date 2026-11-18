import { NextResponse } from "next/server";
import { AuthResponseSchema } from "@/auth/login";
import { authenticated, sameOrigin, SESSION_COOKIE, sessionCookieOptions } from "@/auth/session";
export async function POST(request: Request) {
  if (!authenticated(request)) return NextResponse.json(AuthResponseSchema.parse({ ok: false, message: "Sign in required" }), { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json(AuthResponseSchema.parse({ ok: false, message: "Same-origin request required" }), { status: 403 });
  const response = NextResponse.json(AuthResponseSchema.parse({ ok: true, message: "Signed out" }), { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
