import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
import { normalCdf, bsPut, putDelta, skewedIv, strikeForDelta, realizedVolatility, sampleStd, weekId, calendarDays } from "../../src/engine";
const fixture = await readJson("tests/fixtures/math.json", z.object({
  cdf: z.array(z.object({ x: z.number(), value: z.number() })),
  options: z.array(z.object({ S: z.number(), K: z.number(), T: z.number(), r: z.number(), iv: z.number(), value: z.number() })),
}));
it("Cephes CDF matches SciPy at double precision, including far tails", () => {
  for (const { x, value } of fixture.cdf) {
    expect(Math.abs(normalCdf(x) - value)).toBeLessThanOrEqual(value === 0 ? 0 : 4e-14 * value);
  }
  expect(normalCdf(Infinity)).toBe(1); expect(normalCdf(-Infinity)).toBe(0);
  expect(normalCdf(NaN)).toBeNaN();
});
it("model BS puts match Python for intrinsic, negative rates and high volatility", () => {
  for (const p of fixture.options) expect(Math.abs(bsPut(p.S, p.K, p.T, p.r, p.iv) - p.value)).toBeLessThan(1e-12);
});
it("60-step skewed strike solver reaches the target delta", () => {
  for (const atm of [.3, .8, 1.5]) {
    const K = strikeForDelta(100, 11 / 365, .04, atm, .5, .2);
    expect(K).toBeGreaterThanOrEqual(30); expect(K).toBeLessThanOrEqual(100);
    expect(putDelta(100, K, 11 / 365, .04, skewedIv(atm, 100, K, .5))).toBeCloseTo(-.2, 14);
  }
  expect(skewedIv(1, 100, 110, .5)).toBe(1);
  expect(skewedIv(1, 100, 90, .5)).toBeGreaterThan(1);
});
it("RV uses n log returns and sample variance; weekly labels follow W-FRI", () => {
  const logs = [0, .01, -.01, .02];
  const rv = realizedVolatility(logs.map(x => 100 * Math.exp(x)), 3);
  expect(rv.slice(0, 3)).toEqual([null, null, null]);
  expect(rv[3]).toBeCloseTo(sampleStd([.01, -.02, .03]) * Math.sqrt(252), 12);
  expect(weekId("2026-11-16")).toBe(weekId("2026-11-20"));
  expect(weekId("2026-11-21")).not.toBe(weekId("2026-11-20"));
  expect(calendarDays("2026-03-06", "2026-03-09")).toBe(3);
});
