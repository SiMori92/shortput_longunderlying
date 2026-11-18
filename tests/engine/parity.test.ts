import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseSeedCsv } from "../../src/data/seed";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { BacktestResultSchema, FeatureSchema, ReplayFixtureSchema } from "../../src/schemas/backtest";
import { buildFeatures, replay, summarize, type Feature, type History } from "../../src/engine";
const history: History = Object.fromEntries(await Promise.all(["SOXL", "SOXX", "SPY", "^VIX", "^IRX"].map(async symbol => [symbol, parseSeedCsv(await readFile(path.join("seed/bars", `${symbol}.csv`), "utf8"), symbol).bars])));
const live = await readJson("config/rules/v3_1.json", RulesSchema);
const features = buildFeatures(history, live);
const golden = await readJson("tests/fixtures/features.json", z.array(FeatureSchema));
function near(actual: number, expected: number, tolerance: number, label: string) { expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance); }
it("raw closes → full feature history matches Python, including joins, sample RV, expiry weeks and split factors", () => {
  expect(features.length).toBe(golden.length);
  for (let i = 0; i < golden.length; i++) for (const key of Object.keys(golden[i]!) as (keyof Feature)[]) {
    const a = features[i]![key], b = golden[i]![key];
    if (typeof b === "number") near(a as number, b, 1e-10 * Math.max(1, Math.abs(b)), `${golden[i]!.date}.${key}`);
    else expect(a, `${golden[i]!.date}.${key}`).toEqual(b);
  }
});
for (const [id, ruleFile, target] of [["v3_1", "v3_1.json", 4803823], ["v3_archived", "archive/v3.json", 4392157]] as const) {
  describe(`${id} Python parity (full raw CSV pipeline)`, () => {
    it("matches every day, target, gate, position, closed put and metric; blocks build on failure", async () => {
      const fixture = await readJson(`tests/fixtures/${id}.json`, ReplayFixtureSchema);
      const rules = await readJson(`config/rules/${ruleFile}`, RulesSchema);
      const actual = replay(features, rules, { start: fixture.start, end: fixture.end, capital: fixture.capital });
      expect(actual.days.length).toBe(fixture.days.length); expect(actual.trades.length).toBe(fixture.trades.length);
      let maxDayError = 0;
      actual.days.forEach((day, i) => {
        const expected = fixture.days[i]!;
        expect(day.date).toBe(expected.date); expect(day.gate).toEqual(expected.gate); expect(day.regime).toBe(expected.regime);
        maxDayError = Math.max(maxDayError, Math.abs(day.equity - expected.equity));
        for (const k of ["equity", "cash", "previousEquity", "coreQty", "coreTrade"] as const) near(day[k], expected[k], 1e-6, `${day.date}.${k}`);
        for (const k of ["coreTarget", "executedTarget", "core_w", "put_w", "dd"] as const) near(day[k], expected[k], 1e-11, `${day.date}.${k}`);
        expect(day.positions.length).toBe(expected.positions.length);
        day.positions.forEach((p, j) => {
          const q = expected.positions[j]!; expect(p.open).toBe(q.open); expect(p.expiry).toBe(q.expiry);
          for (const key of ["K", "qty", "credit", "value"] as const) near(p[key], q[key], 1e-6, `${day.date}.put.${key}`);
        });
      });
      actual.trades.forEach((t, i) => {
        const expected = fixture.trades[i]!;
        for (const k of ["open", "close", "assigned", "how", "kind", "Kw"] as const) expect(t[k]).toBe(expected[k]);
        for (const k of ["K", "credit", "exit", "pnl", "notional"] as const) near(t[k], expected[k], 1e-6, `trade ${i}.${k}`);
      });
      const last = actual.days.at(-1)!.equity, expectedLast = fixture.days.at(-1)!.equity;
      near(last / expectedLast, 1, 1e-6, "final relative equity"); expect(Math.round(last)).toBe(target);
      const stats = summarize(actual.days, features, actual.trades, id);
      for (const [k, value] of Object.entries(fixture.metrics)) {
        if (typeof value === "number") near(stats.metrics[k] as number, value, 1e-9 * Math.max(1, Math.abs(value)), `metrics.${k}`);
        else expect(stats.metrics[k]).toEqual(value);
      }
      for (const period of ["monthly", "yearly"] as const) {
        expect(Object.keys(stats[period])).toEqual(Object.keys(fixture[period]));
        for (const [k, v] of Object.entries(fixture[period])) near(stats[period][k]!, v, 1e-11, `${period}.${k}`);
      }
      BacktestResultSchema.parse({ schemaVersion: 1, rulesId: id, start: fixture.start, end: fixture.end, capital: fixture.capital, days: actual.days, trades: actual.trades, coreTrades: actual.coreTrades, entries: actual.entries, ...stats });
      console.info(`${id}: ${actual.days.length} days; ${actual.trades.length} closed puts; ${actual.coreTrades.length} core trades; final=${last.toFixed(9)}; max daily absolute equity error=${maxDayError}`);
    });
  });
}
