import type { Rules } from "../schemas/config";
import type { Feature, Position, Trade } from "./types";
import { bsPut, skewedIv } from "./blackscholes";
import { calendarDays } from "./dates";
export function commissionPerShare(row: Feature, rules: Rules): number { return rules.commission / (100 * (row.unadj / row.S)); }
export function modelPutValue(row: Feature, p: Pick<Position, "K" | "expiry">, rules: Rules): number {
  return Math.max(bsPut(row.S, p.K, calendarDays(row.date, p.expiry) / 365, row.RF, skewedIv(row.IV_ATM, row.S, p.K, rules.skew)), 0);
}
export function managePuts(row: Feature, positions: readonly Position[], cash: number, rules: Rules) {
  const keep: Position[] = [], trades: Trade[] = [];
  for (const original of positions) {
    const p = { ...original };
    let exit: number, assigned = false, how: Trade["how"];
    if (row.date >= p.expiry) {
      exit = Math.max(p.K - row.S, 0); assigned = row.S < p.K; how = "expiry";
      cash -= exit * p.qty + (assigned ? row.S * p.qty * rules.stockSlippage : 0);
    } else {
      p.value = modelPutValue(row, p, rules);
      if (p.value > (1 - rules.profitTake) * p.credit) { keep.push(p); continue; }
      exit = p.value * (1 + rules.premiumSlippage) + commissionPerShare(row, rules); how = "profit";
      cash -= exit * p.qty;
    }
    // Reference reported put P&L excludes assigned-stock slippage; cash includes it.
    trades.push({ kind: "P", open: p.open, close: row.date, K: p.K, Kw: null, credit: p.credit, exit, pnl: (p.credit - exit) * p.qty, notional: p.K * p.qty, assigned, how });
  }
  return { cash, positions: keep, trades };
}
