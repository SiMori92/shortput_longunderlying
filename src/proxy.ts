import { NextRequest, NextResponse } from "next/server";
import { UnauthorizedResponseSchema } from "./schemas/auth";
import { authenticated } from "./auth/session";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPath = path === "/login" || path === "/api/health" || path === "/api/auth/login" || path === "/manifest.webmanifest" || /^\/icon(?:\.svg|-192\.png|-512\.png)$/.test(path) || path.startsWith("/_next/static/") || path.startsWith("/_next/webpack-hmr");
  let response: NextResponse;
  if (!publicPath && !authenticated(request)) {
    response = path.startsWith("/api/") ? NextResponse.json(UnauthorizedResponseSchema.parse({ error: "unauthorized", message: "Sign in required" }), { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
  } else response = NextResponse.next();
  if (!path.startsWith("/_next/static/")) response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}
export const config = { matcher: ["/:path*"] };
