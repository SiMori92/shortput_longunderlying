import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashSync } from "bcryptjs";
import { generateSync } from "otplib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, LoginInputSchema } from "../../src/auth/login";
import { authConfig } from "../../src/auth/config";
import { authenticated, issueSession, sameOrigin, SESSION_COOKIE } from "../../src/auth/session";
import { POST } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
const password = "test-only-password-2026", secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const hash = hashSync(password, 10), now = 1795014000000;
let root: string;
const token = (epoch = now) => generateSync({ secret, epoch: Math.floor(epoch / 1000) });
const req = (input: unknown, origin = "https://monitor.example") => new Request("https://monitor.example/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) });
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "strategy-auth-")); vi.stubEnv("DATA_DIR", root); vi.stubEnv("AUTH_PASSWORD_HASH", hash); vi.stubEnv("AUTH_TOTP_SECRET", secret); vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-32-bytes-long"); vi.stubEnv("APP_ORIGIN", "https://monitor.example"); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
describe("password + TOTP", () => {
  it("accepts both factors and rejects replay across subsequent calls", async () => {
    expect((await login({ password, token: token() }, root, now)).status).toBe(200);
    expect((await login({ password, token: token() }, root, now)).status).toBe(401);
    expect((await login({ password, token: token(now + 30_000) }, root, now + 30_000)).status).toBe(200);
  });
  it("rejects either wrong factor and stale codes", async () => {
    expect((await login({ password: "incorrect", token: token() }, root, now)).status).toBe(401);
    expect((await login({ password, token: token(now - 120_000) }, root, now)).status).toBe(401);
  });
  it("persists the five-attempt limit and resets only the window after 15 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await login({ password: "incorrect", token: token() }, root, now)).status).toBe(401);
    expect(await login({ password, token: token() }, root, now)).toMatchObject({ status: 429, retryAfter: 900 });
    expect((await login({ password, token: token(now + 900_000) }, root, now + 900_000)).status).toBe(200);
  });
  it("serializes concurrent login attempts and fails closed on crashed locks", async () => {
    await mkdir(path.join(root, "auth")); await writeFile(path.join(root, "auth/.login.lock"), "");
    expect((await login({ password, token: token() }, root, now)).status).toBe(429);
  });
  it("refuses corrupt persisted rate state", async () => {
    await mkdir(path.join(root, "auth")); await writeFile(path.join(root, "auth/login.json"), "{}");
    await expect(login({ password, token: token() }, root, now)).rejects.toThrow();
  });
  it("fails closed without complete valid setup", async () => {
    vi.stubEnv("AUTH_TOTP_SECRET", ""); expect(authConfig()).toBeNull();
    expect((await login({ password, token: token() })).status).toBe(503);
  });
  it("rejects remote HTTP origins and bcrypt truncation", () => {
    vi.stubEnv("APP_ORIGIN", "http://public.example"); expect(authConfig()).toBeNull();
    expect(LoginInputSchema.safeParse({ password: "é".repeat(37), token: "123456" }).success).toBe(false);
    expect(LoginInputSchema.safeParse({ password, token: "123456", admin: true }).success).toBe(false);
  });
});
describe("sessions and HTTP boundary", () => {
  it("accepts signed sessions and rejects expired, tampered and excessive lifetime cookies", () => {
    const cookie = issueSession(now), request = new Request("https://monitor.example", { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } });
    expect(authenticated(request, now)).toBe(true); expect(authenticated(request, now + 12 * 3600_000)).toBe(false);
    expect(authenticated(request, now - 3600_000)).toBe(false);
    expect(authenticated(new Request(request, { headers: { cookie: `${SESSION_COOKIE}=x${cookie}` } }), now)).toBe(false);
    vi.stubEnv("SESSION_SECRET", "another-signing-secret-with-at-least-32-bytes"); expect(authenticated(request, now)).toBe(false);
  });
  it("uses configured TLS origin and ignores spoofed forwarded headers", () => {
    expect(sameOrigin(new Request("http://localhost/api", { headers: { origin: "https://monitor.example", host: "localhost:3000" } }))).toBe(true);
    expect(sameOrigin(new Request("http://localhost/api", { headers: { origin: "https://attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" } }))).toBe(false);
  });
  it("rejects cross-site, malformed, oversized and non-JSON requests", async () => {
    expect((await POST(req({}, "https://attacker.example"))).status).toBe(403);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ password: "a".repeat(3000) }))).status).toBe(413);
    expect((await POST(new Request("https://monitor.example/api/auth/login", { method: "POST", headers: { origin: "https://monitor.example" }, body: "x" }))).status).toBe(415);
  });
  it("issues a Secure HttpOnly host-only SameSite=Strict cookie after both factors", async () => {
    const response = await POST(req({ password, token: token(Date.now()) }));
    expect(response.status).toBe(200); const cookie = response.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "Secure", "SameSite=strict", "Path=/", "Max-Age=43200"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Domain="); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authenticated(new Request("https://monitor.example", { headers: { cookie: cookie.split(";")[0]! } }))).toBe(true);
  });
  it("requires session and same origin for logout and expires the cookie", async () => {
    expect((await logout(req({}))).status).toBe(401);
    const request = new Request(req({}), { headers: { origin: "https://monitor.example", cookie: `${SESSION_COOKIE}=${issueSession()}` } });
    const response = await logout(request); expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await logout(new Request(request, { headers: { cookie: request.headers.get("cookie")!, origin: "https://attacker.example" } }))).status).toBe(403);
  });
});
