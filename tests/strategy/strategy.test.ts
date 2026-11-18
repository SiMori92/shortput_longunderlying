import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { seedData } from "../../src/data/seed";
import { readJson } from "../../src/data/store";
import { MonitorConfigsSchema } from "../../src/schemas/monitor";
import { UnderlyingsSchema } from "../../src/schemas/config";
import { PortfolioEntriesSchema } from "../../src/schemas/portfolio";
import { readPortfolio, savePortfolio, PortfolioInputError } from "../../src/portfolio/service";
import { analyzeRun } from "../../src/runs/analysis";
import { buildFeatures } from "../../src/engine";
import { RulesSchema } from "../../src/schemas/config";
import { parseStrategy, requestStrategy, strategySymbols, STRATEGY_COOKIE } from "../../src/strategy/symbols";
import { strategyRoot, strategyRules } from "../../src/strategy/paths";
import type { Bar } from "../../src/engine/types";
import rawRules from "../../config/rules/v3_1.json";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))); });
async function temp() { const d = await mkdtemp(path.join(os.tmpdir(), "strategy-multi-")); roots.push(d); return d; }
const rules = RulesSchema.parse(rawRules);
it("parses the selected ticker from ?symbol=, then the cookie, defaulting to SOXL", () => {
  expect(parseStrategy("SPAX")).toBe("SPAX"); expect(parseStrategy("TSLA")).toBe("SOXL"); expect(parseStrategy(undefined)).toBe("SOXL");
  expect(requestStrategy(new Request("https://x.example/api/runs?symbol=SPAX"))).toBe("SPAX");
  expect(requestStrategy(new Request("https://x.example/api/runs", { headers: { cookie: `a=1; ${STRATEGY_COOKIE}=SPAX` } }))).toBe("SPAX");
  expect(requestStrategy(new Request("https://x.example/api/runs?symbol=SOXL", { headers: { cookie: `${STRATEGY_COOKIE}=SPAX` } }))).toBe("SOXL");
  expect(strategySymbols("SPAX")).toEqual(["SPAX", "SPCX", "SPY", "^VIX", "^IRX"]);
});
it("keeps SOXL at the data root and every other ticker under strategies/<SYMBOL>", () => {
  expect(strategyRoot("/data", "SOXL")).toBe("/data"); expect(strategyRoot("/data", "SPAX")).toBe(path.join("/data", "strategies", "SPAX"));
  expect(strategyRules(rules, "SOXL", { SPAX: [] }).splits).toEqual(rules.splits);
  expect(strategyRules(rules, "SPAX", {}).splits).toEqual([]);
});
it("seeds a separate empty SPAX portfolio and adds new monitor configs to an existing volume", async () => {
  const d = await temp(); await seedData(d);
  expect(await readJson(path.join(d, "strategies/SPAX/portfolio/entries.json"), PortfolioEntriesSchema)).toEqual([]);
  const file = path.join(d, "config/monitors.json"), configs = await readJson(file, MonitorConfigsSchema);
  await writeFile(file, JSON.stringify(configs.filter(c => c.symbol === "SPAX").map(c => ({ ...c, volBrake: 9 }))));
  await seedData(d);
  const merged = await readJson(file, MonitorConfigsSchema);
  expect(merged.map(c => c.symbol)).toEqual(["SPAX", "SOXL"]);
  expect(merged[0]!.volBrake).toBe(9);
});
it("stores portfolios per ticker and rejects another ticker's puts", async () => {
  const d = await temp(); await seedData(d); const now = new Date("2026-11-18T22:00:00Z");
  const entry = { date: "2026-11-16", accountValue: 50000, shares: 10, openPuts: [] };
  let spax = await readPortfolio(d, "SPAX");
  spax = await savePortfolio({ operation: "snapshot", revision: spax.revision, entry }, d, now, "SPAX");
  expect(spax.entries).toEqual([entry]); expect((await readPortfolio(d, "SOXL")).entries).toEqual([]);
  const soxlPut = { id: "p", symbol: "SOXL" as const, opened: "2026-11-16", expiry: "2026-11-20", strike: 40, contracts: 1, credit: 2 };
  await expect(savePortfolio({ operation: "snapshot", revision: spax.revision, entry: { ...entry, openPuts: [soxlPut] } }, d, now, "SPAX")).rejects.toBeInstanceOf(PortfolioInputError);
  expect(JSON.parse(await readFile(path.join(d, "portfolio/entries.json"), "utf8"))).toEqual([]);
});
it("builds SPAX features against SPCX and explains insufficient history honestly", () => {
  const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close, volume: 1, adjclose: null });
  const dates = ["2026-11-12", "2026-11-13", "2026-11-16"], history = { SPAX: dates.map(d => bar(d, 10)), SPCX: dates.map(d => bar(d, 100)), SPY: dates.map(d => bar(d, 500)), "^VIX": dates.map(d => bar(d, 20)), "^IRX": dates.map(d => bar(d, 4)) };
  const features = buildFeatures(history, rules, { symbol: "SPAX", reference: "SPCX" });
  expect(features).toEqual([]);
  const run = analyzeRun({ type: "final", timestamp: "2026-11-16T21:20:00.000Z", asOf: "2026-11-16" }, features, rules, history, [], [], [], { symbol: "SPAX", reference: "SPCX" });
  expect(run.symbol).toBe("SPAX"); expect(run.gate).toBeNull(); expect(run.freshness.status).toBe("blocked");
  expect(run.freshness.issues.find(i => i.code === "history")?.message).toBe("Insufficient history: 3 SPCX sessions stored; the gate needs SMA200 plus RV60 warm-up");
});
it("fills sourced instrument facts on an existing volume without overwriting recorded ones", async () => {
  const d = await temp(); await seedData(d);
  const file = path.join(d, "config/underlyings.json"), list = await readJson(file, UnderlyingsSchema);
  const manual = { value: "Manually recorded issuer", source: "https://example.com/issuer", checkedAt: "2026-11-01T00:00:00Z" };
  await writeFile(file, JSON.stringify(list.map(u => u.symbol === "SPAX" ? { ...u, facts: { ...u.facts!, issuer: manual, aum: "unconfirmed", listedOptions: "unconfirmed" } } : u)));
  await seedData(d);
  const facts = (await readJson(file, UnderlyingsSchema)).find(u => u.symbol === "SPAX")!.facts!;
  expect(facts.issuer).toEqual(manual);
  expect(facts.aum).toMatchObject({ value: 49943100 }); expect(facts.listedOptions).toMatchObject({ value: true });
});
