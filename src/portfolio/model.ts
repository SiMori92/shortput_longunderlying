import type { PortfolioEntry } from "../schemas/portfolio";
import { previousSession } from "../market/calendar";
import type { RunResult } from "../schemas/run";
/** Reconcile quantities, never infer executions or cash P&L from NAV changes. */
export function consistency(entry: PortfolioEntry, previous: PortfolioEntry | undefined, run: RunResult | null): string[] {
  const warnings: string[] = [];
  for (const p of entry.openPuts) if (p.expiry < entry.date) warnings.push(`Put ${p.id} expired before this snapshot; confirm settlement or removal.`);
  if (!previous) return [...warnings, "No earlier snapshot: position changes are unconfirmed."];
  if (previous.date !== previousSession(entry.date)) warnings.push("Snapshots are not consecutive NYSE sessions; intervening trades are unconfirmed.");
  const trusted = previous.date === previousSession(entry.date) && run?.asOf === previous.date && run.type !== "preview" && run.freshness.status === "valid" && !run.freshness.actionsBlocked;
  const expectedShares = previous.shares + (trusted ? run.core?.trade?.roundedQuantity ?? 0 : 0);
  if (entry.shares !== expectedShares) warnings.push(`SOXL shares ${entry.shares}; ${trusted ? "prior recommendation implies" : "previous snapshot has"} ${expectedShares}. Confirm trades, transfers or corrections.`);
  const before = new Map(previous.openPuts.map(p => [p.id, p]));
  for (const p of entry.openPuts) {
    const old = before.get(p.id);
    if (!old) warnings.push(`New put ${p.id}: confirm ${p.contracts} contracts and entry credit.`);
    else if (old.contracts !== p.contracts || old.strike !== p.strike || old.expiry !== p.expiry || old.credit !== p.credit || old.opened !== p.opened) warnings.push(`Put ${p.id} changed; confirm partial close, roll or correction.`);
    before.delete(p.id);
  }
  for (const p of before.values()) warnings.push(`Put ${p.id} removed; record what was done. Realized P&L is unconfirmed without fills.`);
  if (!trusted) warnings.push("No valid prior final recommendation: execution reconciliation is unconfirmed.");
  else if (run.put?.eligible) warnings.push(`Prior final proposed ${run.put.contracts} model put contracts at model strike ${run.put.strike.toFixed(2)}; verify actual fills in the journal.`);
  return warnings;
}
export function recommendation(run: RunResult | null, date: string): { runId: string; recommendation: string } {
  if (!run || run.asOf !== date || run.type === "preview" || run.freshness.status !== "valid" || run.freshness.actionsBlocked) return { runId: "unconfirmed", recommendation: "Unconfirmed — no valid final recommendation for this snapshot date." };
  const lines = [run.account?.kill ? "KILL · manual review; new risk suppressed" : `Gate: ${run.gate?.state ?? "unconfirmed"}`, run.core?.trade ? `SOXL ${run.core.trade.roundedQuantity} shares (next-close estimate)` : "Core: inside band / no trade", run.put?.eligible ? `Sell ${run.put.contracts} model put contracts; model K ${run.put.strike}; ${run.put.expiry}; model credit ${run.put.credit}` : "New put: no action", ...run.openPutActions.map(a => a.description)];
  return { runId: run.id, recommendation: lines.join(" · ") };
}
