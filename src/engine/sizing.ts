import type { Rules } from "../schemas/config";
import type { Feature, Gate, Position } from "./types";
export function coreTarget(row: Feature, gate: Gate, rules: Rules): number {
  if (!gate.gateOn) return 0;
  const w = Math.min(rules.coreCap, rules.coreVolTarget / Math.max(row.RVfast, 1e-6)) * gate.mult;
  return Math.min(w, rules.gapBudget / rules.gapSize);
}
export function coreRebalance(targetWeight: number, lastEquity: number, price: number, shares: number, rules: Rules) {
  const targetShares = targetWeight * lastEquity / price;
  const bandValue = rules.coreBand * Math.max(targetWeight, 1e-9) * lastEquity;
  const shouldTrade = (targetShares === 0 && shares > 0) || (targetShares > 0 && Math.abs(targetShares - shares) * price > bandValue);
  return { targetShares, bandValue, shouldTrade, tradeShares: shouldTrade ? targetShares - shares : 0 };
}
export function putSizing(equity: number, price: number, strike: number, coreShares: number, positions: readonly Position[], rules: Rules) {
  const openNotional = positions.reduce((sum, p) => sum + p.K * p.qty, 0);
  const weekly = rules.notionalPerWeek * equity / strike;
  const total = Math.max(0, rules.maxPutNotional * equity - openNotional) / strike;
  const notional = Math.max(0, Math.min(rules.notionalPerWeek * equity, rules.maxPutNotional * equity - openNotional));
  const shockPrice = price * (1 - rules.gapSize);
  const coreGap = coreShares * price * rules.gapSize;
  const putGap = positions.reduce((sum, p) => sum + (Math.max(p.K - shockPrice, 0) - p.value) * p.qty, 0);
  const used = coreGap + putGap, unit = Math.max(strike - shockPrice, 0);
  const gap = unit > 0 ? Math.max(0, (rules.gapBudget * equity - used) / unit) : null;
  const qty0 = notional / strike;
  const qty = unit > 0 && qty0 > 0 ? Math.min(qty0, gap!) : qty0;
  const limits = [{ name: "weekly" as const, qty: weekly }, { name: "total" as const, qty: total }, { name: "gap" as const, qty: gap }];
  const binding = limits.filter(l => l.qty !== null && Math.abs(l.qty - qty) <= 1e-10 * Math.max(1, qty)).map(l => l.name);
  return { qty, qty0, notional, openNotional, shockPrice, coreGap, putGap, used, unit, weekly, total, gap, binding };
}
export function roundContracts(modelShareQuantity: number): number { return Math.max(0, Math.floor(modelShareQuantity / 100)); }
export function roundTargetShares(modelShares: number): number { return Math.max(0, Math.floor(modelShares)); }
