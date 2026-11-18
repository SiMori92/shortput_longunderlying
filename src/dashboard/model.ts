import { z } from "zod";
import type { Rules } from "../schemas/config";
import type { Feature, ReplayDay, Trade } from "../engine";
import { commissionPerShare, gateState, modelPutValue, prepareGates, replay, rollingMean } from "../engine";
import { DateSchema, NumberSchema, StateSchema } from "../schemas/common";
import type { PortfolioEntry } from "../schemas/portfolio";
import type { RunResult } from "../schemas/run";
const N = NumberSchema;
export const GatePointSchema = z.strictObject({ date: DateSchema, price: N, fast: N.nullable(), slow: N.nullable(), ratio: N, state: StateSchema, soxl: N });
export type GatePoint = z.infer<typeof GatePointSchema>;
export const EpisodeSchema = z.strictObject({ start: DateSchema, end: DateSchema, days: N.int(), state: StateSchema, return: N });
export function gateSeries(features: readonly Feature[], rules: Rules): GatePoint[] {
  const gates = prepareGates(features, rules), ref = features.map(f => f.REF);
  const fast = rollingMean(ref, rules.smaFast), slow = rollingMean(ref, rules.smaSlow);
  return z.array(GatePointSchema).parse(features.map((f, i) => ({ date: f.date, price: f.REF, fast: fast[i], slow: slow[i], ratio: f.RV60 > 0 ? f.RV10 / f.RV60 : 0, state: gateState(gates[i]!, null, rules), soxl: f.S })));
}
export function gateEpisodes(points: readonly GatePoint[]) {
  const episodes: z.infer<typeof EpisodeSchema>[] = [];
  let first: GatePoint | undefined, last: GatePoint | undefined, count = 0;
  const finish = () => { if (first && last) episodes.push({ start: first.date, end: last.date, days: count, state: first.state, return: last.soxl / first.soxl - 1 }); };
  for (const point of points) {
    if (point.state !== first?.state) { finish(); first = point; count = 0; }
    last = point; count++;
  }
  finish(); return z.array(EpisodeSchema).parse(episodes.reverse());
}
export function actionsAvailable(run: RunResult | null, expectedDate: string) {
  return !!run && run.asOf >= expectedDate && run.freshness.status !== "blocked" && !run.freshness.actionsBlocked && !!run.account && !!run.gate;
}
export const PutRowSchema = z.strictObject({ id: z.string(), opened: DateSchema, expiry: DateSchema, strike: N, contracts: N, credit: N, value: N, captured: N.nullable(), distance: N, buyback: N, threshold: N, status: z.enum(["HOLD", "BUY BACK", "EXPIRY"]) });
export type PutRow = z.infer<typeof PutRowSchema>;
export function markPuts(snapshot: PortfolioEntry, row: Feature, rules: Rules, storedMarks?: readonly number[]): PutRow[] {
  return z.array(PutRowSchema).parse(snapshot.openPuts.map((p, i) => {
    const value = storedMarks?.[i] ?? modelPutValue(row, { K: p.strike, expiry: p.expiry }, rules);
    return { id: p.id, opened: p.opened, expiry: p.expiry, strike: p.strike, contracts: p.contracts, credit: p.credit, value, captured: p.credit > 0 ? 1 - value / p.credit : null, distance: row.S / p.strike - 1, buyback: row.date >= p.expiry ? Math.max(p.strike - row.S, 0) : value * (1 + rules.premiumSlippage) + commissionPerShare(row, rules), threshold: (1 - rules.profitTake) * p.credit, status: row.date >= p.expiry ? "EXPIRY" : value <= (1 - rules.profitTake) * p.credit ? "BUY BACK" : "HOLD" };
  }));
}
export function gapBreakdown(row: Feature, shares: number, puts: readonly PutRow[], equity: number, rules: Rules) {
  const core = shares * row.S * rules.gapSize;
  const put = puts.reduce((sum, p) => sum + (Math.max(p.strike - row.S * (1 - rules.gapSize), 0) - p.value) * p.contracts * 100, 0);
  const budget = equity * rules.gapBudget;
  return { core, puts: put, room: Math.max(0, budget - core - put), budget, over: Math.max(0, core + put - budget) };
}
export function historicalReplay(features: readonly Feature[], rules: Rules, end = features.at(-1)?.date ?? "2018-01-01") {
  // Replay through the stored horizon before selecting a date: replay() derives
  // expiries from its selected range. Truncating its input would suppress entries
  // in the final two weeks and change the historical account at the chosen date.
  const full = replay(features, rules, { start: "2018-01-01" });
  return { days: full.days.filter(d => d.date <= end), trades: full.trades.filter(t => t.close <= end), coreTrades: full.coreTrades.filter(t => t.date <= end), entries: full.entries.filter(t => t.open <= end) };
}
export type HistoricalDay = ReplayDay;
export type HistoricalTrade = Trade;
