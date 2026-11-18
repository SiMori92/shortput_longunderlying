import type { Rules } from "../schemas/config";
import type { CoreTrade, EngineState, Entry, Feature, Gate, ReplayDay, ReplayResult } from "./types";
import { prepareGates } from "./gate";
import { calendarDays, weekday } from "./dates";
import { coreRebalance, coreTarget, putSizing } from "./sizing";
import { commissionPerShare, managePuts, modelPutValue } from "./puts";
import { bsPut, skewedIv, strikeForDelta } from "./blackscholes";
export function initialState(capital: number): EngineState {
  return { cash: capital, positions: [], coreQty: 0, coreTarget: 0, lastEquity: capital, previousDate: null, enteredWeek: null, peak: -Infinity, gateOn: false };
}
/** One pure daily step shared by historical replay and future live runs. Expiry
 * calendar is supplied by the caller: known bars for replay, NYSE calendar for live.
 * No kill-switch throttle belongs here: it is a manual live-only overlay.
 */
export function stepDay(input: EngineState, row: Feature, gate: Gate, expiries: readonly string[], rules: Rules) {
  const state: EngineState = { ...input, positions: input.positions.map(p => ({ ...p })) };
  const beforeCore = state.coreQty, executedTarget = state.coreTarget, previousEquity = state.lastEquity;
  if (state.previousDate !== null) {
    const days = calendarDays(state.previousDate, row.date);
    state.cash += state.cash > 0 ? state.cash * row.RF * days / 365 : state.cash * (row.RF + rules.marginSpread) * days / 365;
  }
  state.previousDate = row.date;
  const rebalance = coreRebalance(state.coreTarget, state.lastEquity, row.S, state.coreQty, rules);
  let coreTrade: CoreTrade | null = null;
  if (rebalance.shouldTrade) {
    const dq = rebalance.tradeShares, slippage = Math.abs(dq) * row.S * rules.stockSlippage;
    state.cash -= dq * row.S + slippage; state.coreQty = rebalance.targetShares;
    coreTrade = { date: row.date, qty: dq, price: row.S, slippage };
  }
  state.gateOn = gate.gateOn;
  const managed = managePuts(row, state.positions, state.cash, rules);
  state.positions = managed.positions; state.cash = managed.cash;
  const eqNow = state.cash + state.coreQty * row.S - state.positions.reduce((sum, p) => sum + p.value * p.qty, 0);
  state.peak = Math.max(state.peak, eqNow);
  const dd = eqNow / state.peak - 1;
  const future = expiries.filter(d => d > row.date);
  let entry: Entry | null = null;
  if (gate.gateOn && gate.putOk && state.enteredWeek !== row.week_id && weekday(row.date) <= rules.entryLastWeekday && future.length >= rules.tenorWeeks) {
    // Consume the week even if budget or credit prevents an opening (Python quirk).
    state.enteredWeek = row.week_id;
    const expiry = future[rules.tenorWeeks - 1]!, T = calendarDays(row.date, expiry) / 365;
    const K = strikeForDelta(row.S, T, row.RF, row.IV_ATM, rules.skew, rules.targetDelta);
    const size = putSizing(eqNow, row.S, K, state.coreQty, state.positions, rules);
    if (size.qty > 0) {
      const mid = bsPut(row.S, K, T, row.RF, skewedIv(row.IV_ATM, row.S, K, rules.skew));
      const credit = mid * (1 - rules.premiumSlippage) - commissionPerShare(row, rules);
      if (credit > 0) {
        const p = { K, expiry, qty: size.qty, credit, open: row.date, value: credit };
        state.cash += credit * size.qty; state.positions.push(p); entry = { ...p, mid };
      }
    }
  }
  for (const p of state.positions) if (p.value === 0) p.value = modelPutValue(row, p, rules);
  const equity = state.cash + state.coreQty * row.S - state.positions.reduce((sum, p) => sum + p.value * p.qty, 0);
  state.lastEquity = equity; state.coreTarget = coreTarget(row, gate, rules);
  const day: ReplayDay = { date: row.date, equity, core_w: state.coreQty * row.S / equity,
    put_w: state.positions.reduce((sum, p) => sum + p.K * p.qty, 0) / equity, regime: gate.gateOn, dd,
    cash: state.cash, coreQty: state.coreQty, coreTrade: state.coreQty - beforeCore, executedTarget, previousEquity,
    coreTarget: state.coreTarget, gate: { ...gate }, positions: state.positions.map(p => ({ ...p })) };
  return { state, day, trades: managed.trades, coreTrade, entry };
}
export function replay(features: readonly Feature[], rules: Rules, options: { start: string; end?: string; capital?: number }): ReplayResult {
  const gates = prepareGates(features, rules);
  const selected = features.map((row, i) => ({ row, gate: gates[i]! })).filter(({ row }) => row.date >= options.start && (!options.end || row.date <= options.end));
  const expiries = selected.filter(({ row }) => row.is_expiry).map(({ row }) => row.date);
  let state = initialState(options.capital ?? 1_000_000);
  const days: ReplayDay[] = [], trades: ReplayResult["trades"] = [], coreTrades: CoreTrade[] = [], entries: Entry[] = [];
  for (const { row, gate } of selected) {
    const result = stepDay(state, row, gate, expiries, rules); state = result.state;
    days.push(result.day); trades.push(...result.trades);
    if (result.coreTrade) coreTrades.push(result.coreTrade);
    if (result.entry) entries.push(result.entry);
  }
  return { days, trades, coreTrades, entries, state };
}
