import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { FeatureSchema } from "../../src/schemas/backtest";
import { replay } from "../../src/engine";
const rules = await readJson("config/rules/archive/v3.json", RulesSchema);
const features = await readJson("tests/fixtures/features.json", z.array(FeatureSchema));
const result = replay(features, rules, { start: "2018-01-01", end: "2026-11-16" });
// Independently hand-checked against Strategy v3 - execution guide.html's
// embedded G object and worked examples. Guide is archived V3, not live V3.1.
it("16 Nov archived guide status and feature values", () => {
  const day = result.days.at(-1)!, feature = features.find(d => d.date === day.date)!;
  expect(day.gate).toMatchObject({ a: false, b: true, c: false, gateOn: false });
  expect(day.equity).toBeCloseTo(4392157.223635088, 6);
  expect(day.core_w).toBe(0); expect(day.put_w).toBe(0); expect(day.coreTarget).toBe(0);
  expect(feature.S).toBeCloseTo(48.7599983215332, 12);
  expect(feature.REF_SMA200).toBeCloseTo(160.51641654968262, 10);
  expect(feature.RV10 / feature.RV60).toBeCloseTo(1.8073424543538932, 12);
});
it("22 Oct 21.7% pre-trade weight triggers the band and a $10,280 per $100k core buy", () => {
  const day = result.days.find(d => d.date === "2026-10-22")!;
  const feature = features.find(d => d.date === day.date)!;
  const value = day.coreTrade * feature.S;
  const preWeight = (day.coreQty * feature.S - value) / day.equity;
  expect(preWeight * 100).toBeCloseTo(21.715, 2);
  expect(day.executedTarget).toBe(.3);
  expect(Math.round(value / day.equity * 100000)).toBe(10280);
  // Today's weight exceeds 30%: quantity uses YESTERDAY'S equity.
  expect(day.core_w).toBeCloseTo(.3199485379802705, 12);
});
it("27 Oct profit take and 16 Oct ITM expiry retain guide/Python cash conventions", () => {
  const profit = result.trades.find(t => t.open === "2026-10-19")!;
  expect(profit).toMatchObject({ close: "2026-10-27", how: "profit", assigned: false });
  expect(profit.exit).toBeCloseTo(.4843410232621264, 12);
  const expiry = result.trades.find(t => t.close === "2026-10-16")!;
  expect(expiry).toMatchObject({ open: "2026-10-05", how: "expiry", assigned: true });
  expect(expiry.exit).toBeCloseTo(44.31683943479105, 12);
  expect(expiry.pnl).toBeCloseTo(-257614.7828978665, 6);
});
