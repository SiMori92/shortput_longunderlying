import { expect, it } from "vitest";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { buildFeatures, type History, type Bar } from "../../src/engine";
const rules = await readJson("config/rules/v3_1.json", RulesSchema);
function syntheticHistory(): History {
  const bars: Bar[] = Array.from({ length: 520 }, (_, i) => {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const close = 100 + i / 10;
    return { date, open: close, high: close + 1, low: close - 1, close, adjclose: close / 10, volume: 0 };
  }).filter(b => ![0, 6].includes(new Date(b.date).getUTCDay()));
  return Object.fromEntries(["SOXL", "SOXX", "SPY", "^VIX", "^IRX"].map(s => [s, bars.map(b => ({ ...b }))]));
}
it("close is used, missing reference dates forward fill, off-axis values never join", () => {
  const history = syntheticHistory(), original = buildFeatures(history, rules);
  const chosen = original[20]!.date, previous = original[19]!.REF;
  history.SOXX = history.SOXX!.filter(b => b.date !== chosen);
  history["^IRX"] = history["^IRX"]!.filter(b => b.date !== chosen);
  history.SOXX = [...history.SOXX!, { ...history.SOXX![0]!, date: "2020-01-04", close: 9999 }].sort((a, b) => a.date.localeCompare(b.date));
  const actual = buildFeatures(history, rules);
  expect(actual.find(b => b.date === chosen)!.REF).toBe(previous);
  expect(actual.find(b => b.date === chosen)!.RF).toBe(original[19]!.RF);
  expect(actual[0]!.REF_SMA200).toBe(original[0]!.REF_SMA200);
  expect(actual[0]!.S).toBe(history.SOXL!.find(b => b.date === actual[0]!.date)!.close);
  expect(actual[0]!.S_SMA20).toBeNull(); expect(actual[19]!.S_SMA20).not.toBeNull();
});
it("insufficient reference history yields no features; zero SOXL price is rejected", () => {
  const history = syntheticHistory();
  expect(buildFeatures({ ...history, SOXX: [] }, rules)).toEqual([]);
  expect(buildFeatures(Object.fromEntries(Object.entries(history).map(([k, bars]) => [k, bars.slice(0, 100)])), rules)).toEqual([]);
  const bars = history.SOXL!.map((b, i) => i === 1 ? { ...b, close: 0 } : b);
  expect(() => buildFeatures({ ...history, SOXL: bars }, rules)).toThrow("positive");
});
it("split factor changes exactly on the split date; expiry is last observed week day", () => {
  const history = syntheticHistory();
  const bars = history.SOXL!.filter(b => b.date !== "2021-04-02");
  history.SOXL = bars;
  const actual = buildFeatures(history, rules);
  const before = actual.find(b => b.date === "2021-03-01")!, after = actual.find(b => b.date === "2021-03-02")!;
  expect(before.unadj / before.S).toBe(15); expect(after.unadj / after.S).toBe(1);
  expect(actual.find(b => b.date === "2021-04-01")!.is_expiry).toBe(true);
  const monday = bars.findIndex(b => b.date === "2021-04-05");
  const truncated = buildFeatures({ ...history, SOXL: bars.slice(0, monday + 1) }, rules);
  expect(truncated.at(-1)!.is_expiry).toBe(true); // Reference marks its final observed bar as expiry.
});
