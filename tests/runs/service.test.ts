import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
// Each test runs full market updates + replays; slower build machines (Railway) need more than the 5s default.
vi.setConfig({ testTimeout: 30_000 });
import { seedData } from "../../src/data/seed";
import { atomicWrite, readJson } from "../../src/data/store";
import { BarsSchema, type Bars } from "../../src/schemas/bars";
import { UnderlyingsSchema } from "../../src/schemas/config";
import { RunResultSchema } from "../../src/schemas/run";
import { BacktestResultSchema } from "../../src/schemas/backtest";
import { createRun, RunBusyError, runScheduled } from "../../src/runs/service";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "strategy-m3-")); roots.push(root); await seedData(root);
  const underlyings = await readJson(path.join(root, "config/underlyings.json"), UnderlyingsSchema);
  await atomicWrite(path.join(root, "config/underlyings.json"), UnderlyingsSchema, underlyings.filter(u => !["SPAX", "SPCX"].includes(u.symbol)));
  const history: Record<string, Bars> = {};
  for (const symbol of ["SOXL", "SOXX", "SPY", "^VIX", "^IRX"]) {
    const file = path.join(root, "bars", `${symbol}.json`), data = await readJson(file, BarsSchema);
    // Bounded integration history: no pre-2024 gaps; full 2010 replay remains
    // independently checked by parity. HTTP responses here are deterministic mocks.
    data.bars = data.bars.filter(b => b.date >= "2024-01-01");
    history[symbol] = data; await atomicWrite(file, BarsSchema, data);
  }
  const fetcher: typeof fetch = async input => {
    const symbol = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1)!);
    const bars = history[symbol]?.bars;
    if (!bars) return new Response("Monitor unavailable in test", { status: 404 });
    return Response.json({ chart: { error: null, result: [{ meta: { symbol, exchangeTimezoneName: "America/New_York", regularMarketTime: Date.parse("2026-11-16T20:39:00Z") / 1000, regularMarketPrice: bars.at(-1)!.close }, timestamp: bars.map(b => Date.parse(`${b.date}T14:30:00Z`) / 1000), indicators: { quote: [{ open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume) }] } }] } });
  };
  return { root, history, fetcher };
}
it("final writes schema-valid final/latest/backtests while unknown account suppresses actions", async () => {
  const { root, fetcher } = await setup();
  const run = await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now: new Date("2026-11-16T21:20:00Z") });
  expect(run.freshness.status, JSON.stringify(run.freshness.issues)).toBe("valid"); expect(run.freshness.actionsBlocked).toBe(true);
  expect(run.account).toBeNull(); expect(run.core).toBeNull(); expect(run.put).toBeNull(); expect(run.openPutActions).toEqual([]);
  expect(run.gate?.state).toBe("OFF");
  expect(await readJson(path.join(root, "runs/latest.json"), RunResultSchema)).toEqual(run);
  for (const id of ["v3_1", "v3_archived"]) expect((await readJson(path.join(root, "backtest", `${id}.json`), BacktestResultSchema)).days.length).toBeGreaterThan(0);
  expect(run.spax.verdict).toBe("NOT READY");
});
it("preview cannot persist provisional daily bars or overwrite latest final; final records changes", async () => {
  const { root, history, fetcher } = await setup();
  // Remove today's completed stored bars before a mocked intraday preview.
  for (const [symbol, data] of Object.entries(history)) await atomicWrite(path.join(root, "bars", `${symbol}.json`), BarsSchema, { ...data, bars: data.bars.slice(0, -1) });
  const preview = await createRun({ type: "preview", date: "2026-11-16" }, { root, fetcher, now: new Date("2026-11-16T20:40:00Z") });
  expect(preview.freshness.status).toBe("provisional");
  expect((await readJson(path.join(root, "bars/SOXL.json"), BarsSchema)).bars.at(-1)!.date).toBe("2026-11-13");
  await expect(readFile(path.join(root, "runs/latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const final = await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now: new Date("2026-11-16T21:20:00Z") });
  expect(final.changesSincePreview).toContain("Data: provisional → valid");
  expect((await readJson(path.join(root, "bars/SOXL.json"), BarsSchema)).bars.at(-1)!.date).toBe("2026-11-16");
});
it("failed split/update never overwrites last valid final, including same date", async () => {
  const { root, fetcher } = await setup();
  const now = new Date("2026-11-16T21:20:00Z");
  await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now });
  const prior = await readFile(path.join(root, "runs/latest.json"), "utf8"), canonical = await readFile(path.join(root, "runs/2026-11-16_final.json"), "utf8");
  const failed = await createRun({ type: "final", date: "2026-11-16" }, { root, now, fetcher: async () => new Response("no", { status: 401 }) });
  expect(failed.freshness.status).toBe("blocked"); expect(failed.gate).toBeNull();
  expect(await readFile(path.join(root, "runs/latest.json"), "utf8")).toBe(prior);
  expect(await readFile(path.join(root, "runs/2026-11-16_final.json"), "utf8")).toBe(canonical);
  expect((await readJson(path.join(root, "runs/2026-11-16_final.failed.json"), RunResultSchema)).freshness.status).toBe("blocked");
});
it("catch-up fulfills the previous session's final then skips repeats; holiday jobs skip", async () => {
  const { root, fetcher } = await setup();
  const options = { root, fetcher, now: new Date("2026-11-17T12:00:00Z") };
  expect((await runScheduled("catchup", options)).status).toBe("completed");
  expect((await readJson(path.join(root, "runs/2026-11-16_final.json"), RunResultSchema)).type).toBe("catchup");
  expect((await runScheduled("catchup", options)).status).toBe("skipped");
  expect((await runScheduled("final", { ...options, now: new Date("2026-11-26T21:20:00Z") })).reason).toBe("NYSE closed");
});
it("cross-trigger run lock rejects concurrent writes and releases after a failure", async () => {
  const { root, fetcher } = await setup();
  let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; });
  let signal!: () => void; const entered = new Promise<void>(resolve => { signal = resolve; });
  const first = createRun({ type: "final", date: "2026-11-16" }, { root, now: new Date("2026-11-16T21:20:00Z"), fetcher: async (...args) => { signal(); await ready; return fetcher(...args); } });
  await entered;
  await expect(createRun({ type: "final", date: "2026-11-16" }, { root })).rejects.toBeInstanceOf(RunBusyError);
  release(); await first;
  await expect(createRun({ type: "final", date: "2026-11-15" }, { root })).rejects.toThrow("NYSE session");
});
it("a new split prevents bar writes, and any configured monitor data failure blocks actions", async () => {
  const { root, fetcher } = await setup(), now = new Date("2026-11-16T21:20:00Z");
  const before = await readFile(path.join(root, "bars/SOXL.json"), "utf8");
  const splitFetch: typeof fetch = async (...args) => {
    const response = await fetcher(...args), body = await response.json();
    if (String(args[0]).includes("chart/SOXL")) body.chart.result[0].events = { splits: { x: { date: Date.parse("2026-11-16T14:30:00Z") / 1000, numerator: 2, denominator: 1, splitRatio: "2:1" } } };
    return Response.json(body);
  };
  const failed = await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher: splitFetch, now });
  expect(failed.freshness.issues.some(i => i.code === "split" && i.blocking)).toBe(true);
  expect(await readFile(path.join(root, "bars/SOXL.json"), "utf8")).toBe(before);
  const instruments = await readJson("config/underlyings.json", UnderlyingsSchema);
  await atomicWrite(path.join(root, "config/underlyings.json"), UnderlyingsSchema, instruments);
  // Each ticker is blocked only by its own inputs: a SPAX data failure blocks SPAX, never SOXL.
  const soxl = await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now });
  expect(soxl.freshness.issues.some(i => i.symbol === "SPAX" || i.symbol === "SPCX")).toBe(false);
  const monitorFailure = await createRun({ type: "final", date: "2026-11-16", symbol: "SPAX" }, { root, fetcher, now });
  expect(monitorFailure.symbol).toBe("SPAX");
  expect(monitorFailure.freshness.issues.some(i => (i.symbol === "SPAX" || i.symbol === "SPCX") && i.blocking)).toBe(true);
  expect(monitorFailure.freshness.status).toBe("blocked");
});
it("historical reruns never roll back latest final or nightly replay", async () => {
  const { root, fetcher } = await setup(), now = new Date("2026-11-16T21:20:00Z");
  await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now });
  const previous = await readFile(path.join(root, "backtest/v3_1.json"), "utf8");
  await createRun({ type: "final", date: "2026-11-13" }, { root, fetcher, now });
  expect((await readJson(path.join(root, "runs/latest.json"), RunResultSchema)).asOf).toBe("2026-11-16");
  expect(await readFile(path.join(root, "backtest/v3_1.json"), "utf8")).toBe(previous);
});
it("failed nightly replay does not promote a final; catch-up can recover after repair", async () => {
  const { root, fetcher } = await setup();
  const { writeFile } = await import("node:fs/promises");
  const archive = path.join(root, "config/rules/archive/v3.json"), saved = await readFile(archive, "utf8");
  await writeFile(archive, "{}");
  await expect(createRun({ type: "final", date: "2026-11-16" }, { root, fetcher, now: new Date("2026-11-16T21:20:00Z") })).rejects.toThrow();
  await expect(readFile(path.join(root, "runs/2026-11-16_final.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await readJson(path.join(root, "runs/last-attempt.json"), RunResultSchema)).freshness.status).toBe("blocked");
  await writeFile(archive, saved);
  expect((await runScheduled("catchup", { root, fetcher, now: new Date("2026-11-17T12:00:00Z") })).status).toBe("completed");
});
it("catch-up retries a final blocked by a transient Yahoo null close", async () => {
  const { root, fetcher } = await setup();
  const nullClose: typeof fetch = async (input, init) => {
    const response = await fetcher(input, init); if (!response.ok) return response;
    const body = await response.json(); const close = body.chart.result[0].indicators.quote[0].close; close[close.length - 1] = null;
    return Response.json(body);
  };
  const blocked = await createRun({ type: "final", date: "2026-11-16" }, { root, fetcher: nullClose, now: new Date("2026-11-16T21:20:00Z") });
  expect(blocked.freshness.issues.some(i => i.code === "schema" && i.blocking)).toBe(true);
  expect((await runScheduled("catchup", { root, fetcher, now: new Date("2026-11-17T12:00:00Z") })).status).toBe("completed");
  expect((await readJson(path.join(root, "runs/2026-11-16_final.json"), RunResultSchema)).freshness.status).toBe("valid");
});
it("persists full monitor JSON during final and preview runs without adding monitor actions", async()=>{
 const {root,fetcher}=await setup();
 const registry=await readJson(path.join(root,"config/underlyings.json"),UnderlyingsSchema);
 await atomicWrite(path.join(root,"config/underlyings.json"),UnderlyingsSchema,[...registry,{symbol:"SPCX",role:"reference",leverage:1,reference:null,seedFile:"SPCX.csv"},{symbol:"SPAX",role:"monitor",leverage:2,reference:"SPCX",seedFile:null}]);
 // Provider unavailability is deliberate: monitor failure must stay honest in stored results.
 for(const type of ["final","preview"] as const){
  const run=await createRun({type,date:"2026-11-16",symbol:"SPAX"},{root,fetcher,now:new Date(type==="preview"?"2026-11-16T20:40:00Z":"2026-11-16T21:20:00Z")});
  expect(run.spax.monitor?.checks).toHaveLength(6);expect(run.spax.monitor?.verdict).toBe("NOT READY");expect(run.spax.monitor?.dataStatus).toBe(type==="preview"?"provisional":"unconfirmed");
  const persisted=await readJson(path.join(root,"strategies/SPAX/runs/last-attempt.json"),RunResultSchema);expect(persisted.spax.monitor).toEqual(run.spax.monitor);expect(run.working["spax.monitor.stats.1.count"]!.result).toBe(98);
  expect(JSON.parse(await readFile(path.join(root,"monitors/latest.json"),"utf8")).map((m:{symbol:string})=>m.symbol)).toContain("SPAX");
 }
});
it("one run stores each ticker separately and returns the requested ticker", async () => {
  const { root, fetcher } = await setup(), now = new Date("2026-11-16T21:20:00Z");
  const spax = await createRun({ type: "final", date: "2026-11-16", symbol: "SPAX" }, { root, fetcher, now });
  expect(spax.symbol).toBe("SPAX");
  expect((await readJson(path.join(root, "runs/last-attempt.json"), RunResultSchema)).symbol).toBe("SOXL");
  expect((await readJson(path.join(root, "strategies/SPAX/runs/last-attempt.json"), RunResultSchema)).symbol).toBe("SPAX");
  // A run stored before multi-ticker support has no symbol and reads as SOXL.
  const legacy: Record<string, unknown> = { ...await readJson(path.join(root, "runs/last-attempt.json"), RunResultSchema) }; delete legacy.symbol;
  expect(RunResultSchema.parse(legacy).symbol).toBe("SOXL");
});
