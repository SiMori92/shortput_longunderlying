import type { PortfolioEntry } from "../schemas/portfolio";
import { RunResultSchema, type RunResult } from "../schemas/run";
/** Old runs without a recorded basis must be rerun, never assumed current. */
export function snapshotBasis(snapshots: readonly PortfolioEntry[], asOf: string): string {
  return JSON.stringify(snapshots.filter(e => e.date <= asOf).toSorted((a,b) => a.date.localeCompare(b.date)));
}
export function matchesSnapshot(run: RunResult, snapshots: readonly PortfolioEntry[]): boolean {
  return snapshots.some(e => e.date === run.asOf) && run.working["account.snapshot"]?.result === snapshotBasis(snapshots, run.asOf);
}
export function currentAccountRun(run: RunResult | null, snapshots: readonly PortfolioEntry[]): RunResult | null {
  if (!run || run.freshness.actionsBlocked || matchesSnapshot(run, snapshots)) return run;
  return RunResultSchema.parse({ ...run, freshness: { ...run.freshness, status: "blocked", actionsBlocked: true, issues: [...run.freshness.issues, { code: "account", symbol: null, message: "Account snapshot changed or run basis is unconfirmed. Generate a fresh run.", blocking: true }] }, account: null, core: null, put: null, openPutActions: [] });
}
