import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { authenticated, SESSION_COOKIE } from "../../src/auth/session";
import { POST, GET } from "../../src/app/api/runs/route";
const secret = "test-only-session-secret-with-32-bytes-minimum";
afterEach(() => vi.unstubAllEnvs());
function cookie(exp = Math.floor(Date.now() / 1000) + 3600, totp = true) {
  const body = Buffer.from(JSON.stringify({ user: "owner", totp, exp })).toString("base64url");
  return `${SESSION_COOKIE}=${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function request(body: string, headers: Record<string, string> = {}) { return new Request("https://monitor.example/api/runs", { method: "POST", headers: { cookie: cookie(), origin: "https://monitor.example", "content-type": "application/json", ...headers }, body }); }
it("run APIs fail closed without a signed, unexpired password/TOTP session", async () => {
  vi.stubEnv("SESSION_SECRET", ""); expect((await POST(request('{"type":"final"}'))).status).toBe(401);
  vi.stubEnv("SESSION_SECRET", secret);
  expect((await GET(new Request("https://monitor.example/api/runs"))).status).toBe(401);
  expect(authenticated(request("{}"))).toBe(true);
  expect(authenticated(request("{}", { cookie: `${cookie()}tamper` }))).toBe(false);
  expect(authenticated(request("{}", { cookie: cookie(1) }))).toBe(false);
  expect(authenticated(request("{}", { cookie: cookie(undefined, false) }))).toBe(false);
  expect(authenticated(request("{}", { cookie: cookie(Math.floor(Date.now() / 1000) + 86400) }))).toBe(false);
});
it("valid authentication still requires same-origin JSON and a strict bounded input", async () => {
  vi.stubEnv("SESSION_SECRET", secret);
  expect((await POST(request('{"type":"final"}', { origin: "https://attacker.example" }))).status).toBe(403);
  expect((await POST(request('{"type":"final"}', { "content-type": "text/plain" }))).status).toBe(415);
  expect((await POST(request('{"type":"final","bypass":true}'))).status).toBe(400);
  expect((await POST(request("not-json"))).status).toBe(400);
  expect((await POST(request(" ".repeat(2049)))).status).toBe(400);
});
it("authenticated GET validates stored runs and returns JSON errors for corruption; invalid session date is 400", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os"); const path = await import("node:path");
  const root = await mkdtemp(path.join(tmpdir(), "strategy-api-"));
  vi.stubEnv("SESSION_SECRET", secret); vi.stubEnv("DATA_DIR", root);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await mkdir(path.join(root, "runs"));
    await mkdir(path.join(root, "portfolio"));
    await writeFile(path.join(root, "portfolio/entries.json"), "[]");
    await writeFile(path.join(root, "runs/last-attempt.json"), await readFile("tests/fixtures/market/blocked-run.json"));
    const get = () => GET(new Request("https://monitor.example/api/runs", { headers: { cookie: cookie() } }));
    expect((await get()).status).toBe(200);
    await writeFile(path.join(root, "runs/last-attempt.json"), "{}");
    const response = await get(); expect(response.status).toBe(503); expect((await response.json()).error).toBe("run-failed");
    expect((await POST(request('{"type":"final","date":"2026-11-15"}'))).status).toBe(400);
  } finally { log.mockRestore(); await rm(root, { recursive: true, force: true }); }
});
