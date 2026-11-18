import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { FeatureSchema } from "../../src/schemas/backtest";
import { analyzeRun } from "../../src/runs/analysis";
import type { PortfolioEntry } from "../../src/schemas/portfolio";
const rules = await readJson("config/rules/v3_1.json", RulesSchema), features = await readJson("tests/fixtures/features.json", z.array(FeatureSchema));
const snapshot = (date: string, accountValue = 100000): PortfolioEntry => ({ date, accountValue, shares: 0, openPuts: [] });
function analyze(asOf: string, snapshots: PortfolioEntry[], type: "preview" | "final" = "final") {
  return analyzeRun({ type, timestamp: `${asOf}T21:20:00Z`, asOf }, features.filter(f => f.date <= asOf), rules, {}, snapshots, [], []);
}
it("live actions use manual NAV and shared model math, with model and rounded quantities", () => {
  const run = analyze("2026-10-19", [snapshot("2026-10-19")]);
  expect(run.gate?.state).toBe("ON"); expect(run.account?.equity).toBe(100000);
  expect(run.core?.timing).toBe("next-close-estimate"); expect(run.core?.roundedShares).toBe(Math.floor(run.core!.modelShares));
  expect(run.put?.pricing).toBe("model"); expect(run.put?.contracts).toBe(Math.floor(run.put!.modelContracts));
  expect(run.put!.delta).toBeCloseTo(-.2, 12); expect(run.put!.limits).toHaveLength(3);
  expect(run.put!.modelContracts).toBeCloseTo(Math.min(...run.put!.limits.map(l => l.modelQuantity ?? Infinity)) / 100, 10);
  expect(run.freshness.actionsBlocked).toBe(false);
  function checkNumbers(value: unknown, prefix = "") {
    if (typeof value === "number") expect(run.working[prefix], `working for ${prefix}`).toBeDefined();
    else if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) if (key !== "working") checkNumbers(v, prefix ? `${prefix}.${key}` : key);
  }
  // schemaVersion is a format identifier, not a calculated financial number.
  checkNumbers({ ...run, schemaVersion: undefined });
});
it("kill uses entered snapshot peak and suppresses risk increases without changing replay", () => {
  const run = analyze("2026-10-19", [snapshot("2026-10-16", 150000), snapshot("2026-10-19")]);
  expect(run.account?.kill).toBe(true); expect(run.gate?.state).toBe("KILL");
  expect(run.core?.trade).toBeNull(); expect(run.put).toBeNull();
  expect(run.account?.peakBasis).toBe("entered-snapshots");
});
it("risk cut halves core and disallows new puts; no old snapshot stands in for current NAV", () => {
  const cut = analyze("2018-04-24", [snapshot("2018-04-24")]);
  expect(cut.gate?.state).toBe("RISK CUT"); expect(cut.put).toBeNull();
  const missing = analyze("2026-10-19", [snapshot("2026-10-16")]);
  expect(missing.account).toBeNull(); expect(missing.core).toBeNull(); expect(missing.freshness.actionsBlocked).toBe(true);
});
it("a previously recorded put this week consumes entry even if no longer open", () => {
  const prior: PortfolioEntry = { ...snapshot("2026-10-19"), openPuts: [{ id: "test", symbol: "SOXL", opened: "2026-10-19", strike: 80, expiry: "2026-10-30", contracts: 1, credit: 2 }] };
  const result = analyze("2026-10-20", [prior, snapshot("2026-10-20")]);
  expect(result.put).toBeNull();
});
it("preview flags values within 1% of a threshold and final clears the close-call flag", () => {
  const asOf = "2026-10-19", input = features.filter(f => f.date <= asOf).map(f => ({ ...f }));
  input.at(-1)!.RV10 = 1.599 * input.at(-1)!.RV60;
  const make = (type: "preview" | "final") => analyzeRun({ type, timestamp: `${asOf}T21:20:00Z`, asOf }, input, rules, {}, [], [], []);
  expect(make("preview").gate?.c.closeCall).toBe(true); expect(make("final").gate?.c.closeCall).toBe(false);
});
