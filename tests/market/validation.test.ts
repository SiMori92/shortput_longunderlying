import { expect, it, vi } from "vitest";
import { canAcceptToday, validateUpdate } from "../../src/market/validation";
import { chartUrl, fetchChart, type YahooChart } from "../../src/market/yahoo";
import type { Bar } from "../../src/engine";
// Synthetic unit fixtures; never presented as market observations.
export const bar = (date: string, close = 100): Bar => ({ date, close, open: close, high: close + 1, low: close - 1, volume: 100, adjclose: null });
export function chart(bars: Bar[], symbol = "SOXL"): YahooChart {
  return { meta: { symbol, exchangeTimezoneName: "America/New_York" }, timestamp: bars.map(b => Date.parse(`${b.date}T14:30:00Z`) / 1000), indicators: { quote: [{ open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume) }] } };
}
const options = { now: new Date("2026-11-17T21:20:00Z"), asOf: "2026-11-17", preview: false, knownSplits: [], reference: false };
it("rejects partial 17 Nov bars before 16:15; accepts only same-day ended session metadata", () => {
  const value = chart([bar("2026-11-16"), bar("2026-11-17")]);
  const now = new Date("2026-11-17T20:40:00Z");
  expect(validateUpdate("SOXL", [bar("2026-11-16")], value, { ...options, now }).issues.some(i => i.code === "partial")).toBe(true);
  value.meta.currentTradingPeriod = { regular: { start: Date.parse("2026-11-16T14:30:00Z") / 1000, end: Date.parse("2026-11-16T21:00:00Z") / 1000 } };
  expect(canAcceptToday(value, now)).toBe(false);
  value.meta.currentTradingPeriod = { regular: { start: Date.parse("2026-11-17T14:30:00Z") / 1000, end: Date.parse("2026-11-17T21:00:00Z") / 1000 } };
  expect(canAcceptToday(value, new Date("2026-11-17T21:01:00Z"))).toBe(true);
  expect(canAcceptToday(value, new Date("2026-11-17T21:15:00Z"))).toBe(true);
});
it("preview uses a fresh live model input, leaving persisted bars untouched", () => {
  const value = chart([bar("2026-11-16"), bar("2026-11-17")]);
  value.meta.regularMarketPrice = 100.5; value.meta.regularMarketTime = Date.parse("2026-11-17T20:39:00Z") / 1000;
  const result = validateUpdate("SOXL", [bar("2026-11-16")], value, { ...options, now: new Date("2026-11-17T20:40:00Z"), preview: true });
  expect(result.acceptable).toBe(true); expect(result.view.at(-1)!.close).toBe(100.5);
  expect(result.stored!.bars.at(-1)!.date).toBe("2026-11-16"); expect(result.provisional).toBe(true);
  value.meta.regularMarketTime -= 3600;
  expect(validateUpdate("SOXL", [bar("2026-11-16")], value, { ...options, now: new Date("2026-11-17T20:40:00Z"), preview: true }).acceptable).toBe(false);
});
it("split mismatches stop an update; matching known factors are accepted", () => {
  const value = chart([bar("2026-11-16"), bar("2026-11-17")]);
  value.events = { splits: { x: { date: value.timestamp![1]!, numerator: 3, denominator: 1, splitRatio: "3:1" } } };
  expect(validateUpdate("SOXL", [], value, options).issues.some(i => i.code === "split")).toBe(true);
  expect(validateUpdate("SOXL", [], value, { ...options, knownSplits: [{ date: "2026-11-17", factor: 3 }] }).acceptable).toBe(true);
});
it("checks 0.5% stitching and refuses a non-overlapping extension", () => {
  expect(validateUpdate("SOXL", [bar("2026-11-16")], chart([bar("2026-11-16", 100.6), bar("2026-11-17")]), options).issues.some(i => i.code === "stitch")).toBe(true);
  const result = validateUpdate("SOXL", [bar("2026-11-16")], chart([bar("2026-11-16", 100.4), bar("2026-11-17")]), options);
  expect(result.acceptable).toBe(true); expect(result.stored!.bars[0]!.close).toBe(100);
  expect(validateUpdate("SOXL", [bar("2026-11-16")], chart([bar("2026-11-17")]), options).acceptable).toBe(false);
});
it("flags missing sessions, stale data, >40% reference moves, duplicates and null quotes", () => {
  const missing = validateUpdate("SOXL", [], chart([bar("2026-11-13"), bar("2026-11-17")]), options);
  expect(missing.issues.some(i => i.code === "missing")).toBe(true);
  expect(validateUpdate("SOXL", [], chart([bar("2026-11-16")]), options).issues.some(i => i.code === "stale")).toBe(true);
  expect(validateUpdate("SOXX", [], chart([bar("2026-11-16"), bar("2026-11-17", 150)], "SOXX"), { ...options, reference: true }).issues.some(i => i.code === "move")).toBe(true);
  expect(validateUpdate("SOXL", [], chart([bar("2026-11-17"), bar("2026-11-17")]), options).issues.some(i => i.code === "schema")).toBe(true);
  const nullQuote = chart([bar("2026-11-17")]); nullQuote.indicators.quote[0]!.close[0] = null;
  expect(validateUpdate("SOXL", [], nullQuote, options).acceptable).toBe(false);
});
it("handles midnight-UTC Cboe daily labels and ignores NYSE holidays in missing checks", () => {
  const value = chart([bar("2026-11-25"), bar("2026-11-27")], "^IRX");
  value.meta.exchangeTimezoneName = "America/Chicago";
  value.timestamp = [Date.parse("2026-11-25T00:00:00Z") / 1000, Date.parse("2026-11-27T00:00:00Z") / 1000];
  const result = validateUpdate("^IRX", [], value, { ...options, now: new Date("2026-11-28T00:00:00Z"), asOf: "2026-11-27" });
  expect(result.acceptable).toBe(true); expect(result.view.map(b => b.date)).toEqual(["2026-11-25", "2026-11-27"]);
});
it("Yahoo request contains only symbol/time parameters and uses bounded retries", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(Response.json({ chart: { error: null, result: [chart([bar("2026-11-17")])] } }));
  await fetchChart("SOXL", "2026-11-16", options.now, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const url = new URL(chartUrl("^IRX", "2026-11-16", options.now));
  expect([...url.searchParams.keys()].sort()).toEqual(["events", "interval", "period1", "period2"]);
  const invalid = vi.fn<typeof fetch>().mockResolvedValue(new Response("no", { status: 401 }));
  await expect(fetchChart("SOXL", undefined, options.now, invalid)).rejects.toThrow("401"); expect(invalid).toHaveBeenCalledTimes(1);
});
it("Yahoo rejects schema and identity mismatches", async () => {
  const wrong = chart([bar("2026-11-17")], "SPY");
  await expect(fetchChart("SOXL", undefined, options.now, async () => Response.json({ chart: { error: null, result: [wrong] } }))).rejects.toThrow("identity");
  await expect(fetchChart("SOXL", undefined, options.now, async () => Response.json({ bad: true }))).rejects.toThrow();
});
it("excuses only reviewed gaps for the missing-session check", () => {
  const value = chart([bar("2026-11-13"), bar("2026-11-17")], "^IRX");
  expect(validateUpdate("^IRX", [], value, { ...options, knownGaps: [{ date: "2026-11-16" }] }).issues.some(i => i.code === "missing")).toBe(false);
  expect(validateUpdate("^IRX", [], value, { ...options, knownGaps: [{ date: "2026-11-12" }] }).issues.some(i => i.code === "missing")).toBe(true);
});
it("accepts a split only when its date and factor were reviewed", () => {
  const value = { ...chart([bar("2026-11-16"), bar("2026-11-17")], "SOXX"), events: { splits: { a: { date: Date.parse("2026-11-05T14:30:00Z") / 1000, numerator: 3, denominator: 1, splitRatio: "3:1" } } } } satisfies YahooChart;
  expect(validateUpdate("SOXX", [bar("2026-11-16")], value, options).issues.some(i => i.code === "split")).toBe(true);
  expect(validateUpdate("SOXX", [bar("2026-11-16")], value, { ...options, knownSplits: [{ date: "2026-11-05", factor: 2 }] }).issues.some(i => i.code === "split")).toBe(true);
  expect(validateUpdate("SOXX", [bar("2026-11-16")], value, { ...options, knownSplits: [{ date: "2026-11-05", factor: 3 }] }).issues.some(i => i.code === "split")).toBe(false);
});
