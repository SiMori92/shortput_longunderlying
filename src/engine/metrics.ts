import type { Feature, ReplayDay, Trade } from "./types";
import { calendarDays } from "./dates";
import { mean, quantile, sampleStd } from "./statistics";
const finite = (n: number): number | null => Number.isFinite(n) ? n : null;
function periodReturns(days: readonly ReplayDay[], key: (date: string) => string): Record<string, number> {
  if (!days.length) return {};
  const closes = new Map<string, number>();
  for (const d of days) closes.set(key(d.date), d.equity);
  let prev = days[0]!.equity;
  return Object.fromEntries([...closes].map(([period, value]) => { const r = value / prev - 1; prev = value; return [period, r]; }));
}
/** Same baselines as Python metrics()/riskcut.monthly(): first observed equity,
 * sample daily std, and RF/252. Missing/infinite statistics serialize as null.
 */
export function summarize(days: readonly ReplayDay[], rf: readonly Pick<Feature, "date" | "RF">[], trades: readonly Trade[] = [], label = "") {
  const monthly = periodReturns(days, d => d.slice(0, 7)), yearly = periodReturns(days, d => d.slice(0, 4));
  if (!days.length) return { metrics: { name: label } as Record<string, string | number | null>, monthly, yearly };
  const returns = days.slice(1).map((d, i) => d.equity / days[i]!.equity - 1);
  const rates = new Map(rf.map(r => [r.date, r.RF])); let priorRate = NaN;
  const excess = days.slice(1).map((d, i) => { priorRate = rates.get(d.date) ?? priorRate; return returns[i]! - priorRate / 252; });
  let peak = -Infinity;
  const dd = days.map(d => { peak = Math.max(peak, d.equity); return d.equity / peak - 1; });
  const mdd = Math.min(...dd), years = calendarDays(days[0]!.date, days.at(-1)!.date) / 365.25;
  const cagr = (days.at(-1)!.equity / days[0]!.equity) ** (1 / years) - 1;
  const std = sampleStd(returns), vol = std * Math.sqrt(252), downside = sampleStd(returns.filter(r => r < 0)) * Math.sqrt(252);
  const durations: number[] = []; let duration = 0;
  for (const d of dd) { if (d < 0) duration++; else if (duration) { durations.push(duration); duration = 0; } }
  if (duration) durations.push(duration);
  const yearlyValues = Object.values(yearly), ex26 = Object.entries(yearly).filter(([y]) => y <= "2025").map(([, r]) => r);
  const drawdownIn = (a: string, b: string) => { const values = dd.filter((_, i) => days[i]!.date >= a && days[i]!.date <= b); return values.length ? Math.min(...values) : NaN; };
  const losses = trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
  const output: Record<string, string | number | null> = {
    name: label, CAGR: finite(cagr), Vol: finite(vol), Sharpe: finite(mean(excess) / std * Math.sqrt(252)),
    Sortino: finite(downside > 0 ? (mean(returns) * 252 - mean(rf.map(r => r.RF))) / downside : NaN),
    Calmar: finite(mdd ? cagr / Math.abs(mdd) : NaN), MDD: finite(mdd), AvgDD_days: durations.length ? mean(durations) : 0, MaxDD_days: durations.length ? Math.max(...durations) : 0,
    VaR95: finite(-quantile(returns, 0.05)), VaR99: finite(-quantile(returns, 0.01)), WorstYear: finite(Math.min(...yearlyValues)), Yrs_ge_20pct: mean(yearlyValues.map(r => r >= .20 ? 1 : 0)),
    WorstDay: finite(Math.min(...returns)), CVaR99: finite(-mean(returns.filter(r => r <= quantile(returns, .01)))), Ulcer: finite(Math.sqrt(mean(dd.map(d => d ** 2)))),
    CAGR_ex26: finite(ex26.length ? ex26.reduce((p, r) => p * (1 + r), 1) ** (1 / ex26.length) - 1 : NaN),
    DD_2026JunJul: finite(drawdownIn("2026-06-01", "2026-08-31")), DD_2018: finite(drawdownIn("2018-01-01", "2019-06-30")), DD_2022: finite(drawdownIn("2022-01-01", "2022-12-31")),
  };
  if (trades.length) Object.assign(output, { Trades: trades.length, WinRate: mean(trades.map(t => t.pnl > 0 ? 1 : 0)), ProfitFactor: losses ? trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / -losses : null, AssignRate: mean(trades.map(t => t.assigned ? 1 : 0)) });
  return { metrics: output, monthly, yearly };
}
export function buyHold(features: readonly Feature[], start: string, end?: string, capital = 1_000_000) {
  const selected = features.filter(r => r.date >= start && (!end || r.date <= end)); const first = selected[0]?.S;
  return selected.map(r => ({ date: r.date, equity: r.S / first! * capital }));
}
