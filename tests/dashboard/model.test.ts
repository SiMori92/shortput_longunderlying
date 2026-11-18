import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { FeatureSchema } from "../../src/schemas/backtest";
import { RunResultSchema } from "../../src/schemas/run";
import { actionsAvailable, gapBreakdown, gateEpisodes, gateSeries, historicalReplay, markPuts } from "../../src/dashboard/model";
const rules = await readJson("config/rules/v3_1.json", RulesSchema);
const archive = await readJson("config/rules/archive/v3.json", RulesSchema);
const features = await readJson("tests/fixtures/features.json", z.array(FeatureSchema));
const series = gateSeries(features, rules), row = features.at(-1)!;
it("16 Nov condition dashboard reproduces the guide without certifying live data", () => {
  const point = series.at(-1)!;
  expect(point).toMatchObject({ date: "2026-11-16", state: "OFF" });
  expect(point.price).toBeCloseTo(141.22000122070312, 10);
  expect(point.fast).toBeCloseTo(171.25546600341798, 10);
  expect(point.slow).toBeCloseTo(160.51641654968262, 10);
  expect(point.ratio).toBeCloseTo(1.8073424543538932, 12);
  expect(point.price / point.slow! - 1).toBeCloseTo(-.12021459, 6);
});
it("separates archived guide equity from V3.1 equity", () => {
  expect(historicalReplay(features, rules).days.at(-1)!.equity).toBeCloseTo(4803823.027785802, 6);
  const last = historicalReplay(features, archive).days.at(-1)!;
  expect(last.equity).toBeCloseTo(4392157.223635084, 6);
  expect(last.positions).toEqual([]); expect(last.coreQty).toBe(0);
});
it("episodes are consecutive, inclusive and cover every session once", () => {
  const points = series.slice(-300), episodes = gateEpisodes(points);
  expect(episodes.reduce((sum, e) => sum + e.days, 0)).toBe(points.length);
  for (const e of episodes) {
    const rows = points.filter(p => p.date >= e.start && p.date <= e.end);
    expect(rows.every(p => p.state === e.state)).toBe(true);
    expect(e.return).toBe(rows.at(-1)!.soxl / rows[0]!.soxl - 1);
  }
  expect(gateEpisodes(series).some(e => e.state === "RISK CUT")).toBe(true);
});
it("rejects absent, blocked, accountless and stale actions", async () => {
  const blocked = await readJson("tests/fixtures/market/blocked-run.json", RunResultSchema);
  expect(actionsAvailable(null, "2026-11-17")).toBe(false);
  expect(actionsAvailable(blocked, "2026-11-17")).toBe(false);
  const ready = { ...blocked, asOf: "2026-11-17", freshness: { ...blocked.freshness, status: "valid" as const, actionsBlocked: false }, gate: { a: { value: 1, threshold: 1, distance: 0, passes: true, closeCall: false }, b: { value: 1, threshold: 1, distance: 0, passes: true, closeCall: false }, c: { value: 1, threshold: 1.6, distance: .375, passes: true, closeCall: false }, state: "ON" as const, gateOn: true, multiplier: 1, putOk: true }, account: { equity: 100000, peak: 100000, peakBasis: "entered-snapshots" as const, drawdown: 0, coreWeight: 0, putNotionalWeight: 0, gapUsed: 0, kill: false } };
  expect(actionsAvailable(ready, "2026-11-17")).toBe(true);
  expect(actionsAvailable(ready, "2026-11-18")).toBe(false);
  expect(actionsAvailable({ ...ready, account: null }, "2026-11-17")).toBe(false);
});
const snapshot = { date: row.date, accountValue: 100000, shares: 100, openPuts: [{ id: "test", symbol: "SOXL" as const, opened: "2026-11-09", strike: 40, expiry: "2026-11-20", contracts: 2, credit: 2 }] };
it("marks manual puts with model capture, strike distance and costs", () => {
  const p = markPuts(snapshot, row, rules)[0]!;
  expect(p.contracts).toBe(2); expect(p.captured).toBe(1 - p.value / 2);
  expect(p.distance).toBe(row.S / 40 - 1);
  expect(p.buyback).toBeCloseTo(p.value * 1.05 + rules.commission / (100 * row.unadj / row.S), 12);
  expect(p.status).toBe(p.value <= .6 + 1e-15 ? "BUY BACK" : "HOLD");
});
it("zero credit has undefined capture, expiry uses intrinsic", () => {
  const expired = { ...snapshot, openPuts: [{ ...snapshot.openPuts[0]!, credit: 0, strike: 60, expiry: row.date }] };
  const p = markPuts(expired, row, rules)[0]!;
  expect(p.captured).toBeNull(); expect(p.status).toBe("EXPIRY"); expect(p.buyback).toBe(60 - row.S);
});
it("preserves replay initial-credit marks instead of repricing the Python quirk", () => {
  expect(markPuts(snapshot, row, rules, [2])[0]!.value).toBe(2);
});
it("gap breakdown retains negative put offsets and exposes over-budget loss", () => {
  const puts = markPuts(snapshot, row, rules);
  const gap = gapBreakdown(row, snapshot.shares, puts, snapshot.accountValue, rules);
  expect(gap.core).toBe(snapshot.shares * row.S * .3);
  expect(gap.puts).toBe((Math.max(40 - row.S * .7, 0) - puts[0]!.value) * 200);
  expect(gap.room).toBe(Math.max(0, 10000 - gap.core - gap.puts));
  expect(gapBreakdown(row, 100000, puts, 100000, rules).over).toBeGreaterThan(0);
});

it("historical date selection retains known future expiries and the guide open put", () => {
  const selected = historicalReplay(features, archive, "2026-10-22");
  expect(selected.days.at(-1)!.date).toBe("2026-10-22");
  expect(selected.days.at(-1)!.positions[0]!.K).toBeCloseTo(83.8488386987012, 10);
  expect(selected.trades.every(t => t.close <= "2026-10-22")).toBe(true);
});
