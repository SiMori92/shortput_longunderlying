import { describe, expect, it } from "vitest";
import { readJson } from "../../src/data/store";
import { RulesSchema } from "../../src/schemas/config";
import { coreRebalance, coreTarget, putSizing, roundContracts, roundTargetShares, evaluateGate, prepareGates, liveRiskPolicy, stepDay, initialState, managePuts, modelPutValue, commissionPerShare, summarize, type Feature, type Position } from "../../src/engine";
const rules = await readJson("config/rules/v3_1.json", RulesSchema);
// Deliberately synthetic unit inputs, never written to app market data.
const row: Feature = { date: "2026-11-16", S: 100, H: 101, L: 99, REF: 110, SPY: 600, VIX: .2, RF: .04,
  RV10: .8, RV20: .8, RV60: .5, RVfast: .8, IV_ATM: .8, REF_SMA50: 105, REF_SMA200: 100,
  S_SMA20: null, S_SMA50: null, S_SMA100: null, unadj: 100, is_expiry: false, week_id: "2026-11-14/2026-11-20" };
const on = evaluateGate(row, rules);
const off = { ...on, gateOn: false, putOk: false };
const position: Position = { K: 90, expiry: "2026-11-27", qty: 100, credit: 5, open: "2026-11-09", value: 5 };
describe("gate and manual risk overlay", () => {
  it("strict price/trend boundaries, equality at 1.6 and zero RV60", () => {
    const cut = evaluateGate({ ...row, REF: 100 }, rules);
    expect(cut).toEqual({ a: false, b: true, c: true, gateOn: true, mult: .5, putOk: false });
    expect(evaluateGate({ ...row, REF_SMA50: 100 }, rules).gateOn).toBe(false);
    expect(evaluateGate({ ...row, RV10: .80001 }, rules).gateOn).toBe(false);
    expect(evaluateGate({ ...row, RV60: 0 }, rules).c).toBe(true);
    expect(evaluateGate({ ...row, REF: 100 }, { ...rules, gateMode: "all-conditions" }).gateOn).toBe(false);
    expect(coreTarget(row, cut, rules)).toBe(.15); expect(coreTarget(row, off, rules)).toBe(0);
    expect(coreTarget({ ...row, RVfast: 2 }, on, rules)).toBeCloseTo(.175);
  });
  it("riskcut gate SMA warm-up is on post-feature history", () => {
    const gates = prepareGates(Array.from({ length: 201 }, (_, i) => ({ ...row, REF: 100 + i })), rules);
    expect(gates[198]!.gateOn).toBe(false); expect(gates[199]!.gateOn).toBe(true);
  });
  it("kill suppresses live new risk at -25% without changing the model gate", () => {
    expect(liveRiskPolicy(on, -.25, rules)).toEqual({ state: "KILL", allowCoreIncrease: false, allowNewPut: false });
    expect(liveRiskPolicy(on, -.2499, rules).state).toBe("ON");
    expect(on.gateOn).toBe(true);
  });
});
describe("core execution and cash", () => {
  it("band is strict > and measured against yesterday equity; target zero exits", () => {
    expect(coreRebalance(.3, 100000, 100, 225, rules).shouldTrade).toBe(false);
    expect(coreRebalance(.3, 100000, 100, 224.99, rules).shouldTrade).toBe(true);
    expect(coreRebalance(0, 100000, 100, 1, rules).tradeShares).toBe(-1);
  });
  it("executes yesterday target even if today's gate switches off; applies slippage", () => {
    const input = { ...initialState(100000), coreTarget: .3 };
    const result = stepDay(input, row, off, [], rules);
    expect(result.day.coreQty).toBe(300); expect(result.day.coreTarget).toBe(0);
    expect(result.state.cash).toBe(69985); expect(input.cash).toBe(100000);
    const next = stepDay(result.state, { ...row, date: "2026-11-17" }, off, [], rules);
    expect(next.day.coreQty).toBe(0);
  });
  it("calendar-day interest uses borrowing spread only for negative cash", () => {
    for (const cash of [100000, -100000]) {
      const input = { ...initialState(100000), cash, previousDate: "2026-11-13" };
      const result = stepDay(input, row, off, [], rules);
      expect(result.state.cash).toBeCloseTo(cash * (1 + (.04 + (cash < 0 ? .015 : 0)) * 3 / 365), 10);
    }
  });
});
describe("put limits and lifecycle", () => {
  it("each of the three limits can bind; exhausted/zero-unit gaps stay finite", () => {
    expect(putSizing(100000, 100, 90, 0, [], rules).binding).toContain("weekly");
    expect(putSizing(100000, 100, 90, 0, [{ ...position, K: 100, qty: 300 }], rules).binding).toContain("total");
    expect(putSizing(100000, 100, 90, 300, [], rules).binding).toContain("gap");
    expect(putSizing(100000, 100, 90, 400, [], rules).qty).toBe(0);
    expect(putSizing(100000, 100, 60, 400, [], rules).gap).toBeNull();
    expect(putSizing(100000, 100, 90, 0, [{ ...position, K: 60 }], rules).putGap).toBe(-500);
    expect(roundContracts(299.99)).toBe(2); expect(roundTargetShares(12.99)).toBe(12);
  });
  it("opens only Mon–Wed with two future expiries; initial mark is credit", () => {
    const result = stepDay(initialState(100000), row, on, ["2026-11-20", "2026-11-27"], rules);
    expect(result.entry).not.toBeNull(); expect(result.entry!.expiry).toBe("2026-11-27");
    expect(result.entry!.value).toBe(result.entry!.credit); expect(result.entry!.mid).toBeGreaterThan(result.entry!.credit);
    expect(result.day.equity).toBeCloseTo(100000, 9);
    expect(stepDay(initialState(100000), row, on, ["2026-11-20"], rules).entry).toBeNull();
    expect(stepDay(initialState(100000), { ...row, date: "2026-11-19" }, on, ["2026-11-20", "2026-11-27"], rules).entry).toBeNull();
  });
  it("consumes a blocked entry week and prevents a second try after room returns", () => {
    const input = { ...initialState(100000), cash: 60000, coreQty: 400, coreTarget: .4 };
    const first = stepDay(input, row, on, ["2026-11-20", "2026-11-27"], rules);
    expect(first.entry).toBeNull(); expect(first.state.enteredWeek).toBe(row.week_id);
    const second = stepDay({ ...first.state, coreQty: 0, coreTarget: 0 }, { ...row, date: "2026-11-17" }, on, ["2026-11-20", "2026-11-27"], rules);
    expect(second.entry).toBeNull();
  });
  it("profit exit includes model mark, premium slippage and split-adjusted commission", () => {
    const p = { ...position, credit: 100 };
    const result = managePuts(row, [p], 10000, rules);
    const expectedExit = modelPutValue(row, p, rules) * 1.05 + .0065;
    expect(result.trades[0]!.how).toBe("profit"); expect(result.trades[0]!.exit).toBeCloseTo(expectedExit, 14);
    expect(result.cash).toBeCloseTo(10000 - expectedExit * 100, 10);
    expect(p.value).toBe(5);
    expect(commissionPerShare({ ...row, unadj: 1500 }, rules)).toBeCloseTo(.65 / 1500, 15);
  });
  it("ITM expiry cash includes assignment slippage but reported put P&L excludes it", () => {
    const result = managePuts({ ...row, S: 80, date: position.expiry }, [position], 10000, rules);
    expect(result.cash).toBe(8996); expect(result.positions).toEqual([]);
    expect(result.trades[0]).toMatchObject({ assigned: true, how: "expiry", exit: 10, pnl: -500 });
    const atm = managePuts({ ...row, S: 90, date: position.expiry }, [position], 10000, rules);
    expect(atm.cash).toBe(10000); expect(atm.trades[0]!.assigned).toBe(false);
  });
});
it("period returns use first equity, drawdown uses running peak, empty summary is serializable", () => {
  const base = stepDay(initialState(100), row, off, [], rules).day;
  const days = [{ ...base, date: "2025-12-30", equity: 100 }, { ...base, date: "2025-12-31", equity: 110 }, { ...base, date: "2026-01-02", equity: 88 }];
  const result = summarize(days, days.map(d => ({ date: d.date, RF: 0 })));
  expect(result.monthly["2025-12"]).toBeCloseTo(.1); expect(result.monthly["2026-01"]).toBeCloseTo(-.2);
  expect(result.yearly["2026"]).toBeCloseTo(-.2); expect(result.metrics.MDD).toBeCloseTo(-.2);
  expect(summarize([], []).monthly).toEqual({});
  expect(JSON.stringify(summarize([base], [{ date: base.date, RF: 0 }]))).not.toContain("NaN");
});
