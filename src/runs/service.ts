import { loadMonitors } from "../monitors/service";
import { attachMonitor } from "../monitors/run";
import { MonitorResultSchema } from "../schemas/monitor";
import path from "node:path";
import { z } from "zod";
import { atomicWrite, dataRoot, isMissing, readJson } from "../data/store";
import { RulesSchema } from "../schemas/config";
import { PortfolioEntriesSchema } from "../schemas/portfolio";
import { RunInputSchema, RunResultSchema, type RunResult } from "../schemas/run";
import { BacktestResultSchema } from "../schemas/backtest";
import { buildFeatures, replay, summarize } from "../engine";
import { updateMarket } from "../market/update";
import { expectedClose, marketDate, previousSession, session } from "../market/calendar";
import { dataIssue } from "../market/validation";
import { analyzeRun } from "./analysis";
import type { Fetcher } from "../market/yahoo";
import { KnownSplitsSchema } from "../schemas/market";
import { DEFAULT_STRATEGY, STRATEGIES, STRATEGY_SYMBOLS, strategySymbols, type StrategySymbol } from "../strategy/symbols";
import { strategyRoot, strategyRules } from "../strategy/paths";
export class RunBusyError extends Error {}
export class InvalidRunInputError extends Error {}
const runtime = globalThis as typeof globalThis & { strategyRunLocks?: Set<string> };
export async function readOptionalRun(file: string): Promise<RunResult | null> {
  try { return await readJson(file, RunResultSchema); } catch (e) { if (isMissing(e)) return null; throw e; }
}
export function previewChanges(preview: RunResult | null, final: RunResult): string[] {
  if (!preview || preview.asOf !== final.asOf) return [];
  const changes: string[] = [];
  for (const key of ["a", "b", "c"] as const) {
    const before = preview.gate?.[key], after = final.gate?.[key];
    if (before?.passes !== after?.passes) changes.push(`Condition ${key}: ${before?.passes ?? "unconfirmed"} → ${after?.passes ?? "unconfirmed"}`);
    if (before?.value !== after?.value) changes.push(`Condition ${key} value: ${before?.value ?? "unconfirmed"} → ${after?.value ?? "unconfirmed"}`);
  }
  for (const [name, before, after] of [
    ["Gate", preview.gate?.state, final.gate?.state], ["Data", preview.freshness.status, final.freshness.status],
    ["Core shares (model)", preview.core?.modelShares, final.core?.modelShares], ["Put strike (model)", preview.put?.strike, final.put?.strike],
    ["Put credit (model)", preview.put?.credit, final.put?.credit], ["Put contracts", preview.put?.contracts, final.put?.contracts],
    ["Actions blocked", preview.freshness.actionsBlocked, final.freshness.actionsBlocked],
  ] as const) if (before !== after) changes.push(`${name}: ${before ?? "unconfirmed"} → ${after ?? "unconfirmed"}`);
  return changes;
}
export async function createRun(input: unknown, options: { now?: Date; root?: string; fetcher?: Fetcher } = {}): Promise<RunResult> {
  const request = RunInputSchema.parse(input), now = options.now ?? new Date(), root = options.root ?? dataRoot();
  const today = marketDate(now);
  const asOf = request.date ?? (request.type === "preview" ? today : request.type === "catchup" ? previousSession(today) : expectedClose(now));
  if (asOf > today || !session(asOf)) throw new InvalidRunInputError("Run date must be an existing NYSE session");
  if (request.type === "preview" && asOf !== today) throw new InvalidRunInputError("Preview must use today's session");
  runtime.strategyRunLocks ??= new Set();
  if (runtime.strategyRunLocks.has(root)) throw new RunBusyError("A market update/run is already in progress");
  runtime.strategyRunLocks.add(root);
  const failures: [string, RunResult][] = [];
  try {
    const base = await readJson(path.join(root, "config/rules/v3_1.json"), RulesSchema);
    if (base.id !== "v3_1" || base.archived || base.gateMode !== "risk-cut") throw new Error("Live rules must be V3.1 risk-cut");
    const knownSplits = await readJson(path.join(root, "config/known-splits.json"), KnownSplitsSchema);
    // One provider update serves every ticker; each strategy is then analyzed and stored independently.
    const update = await updateMarket({ now, asOf, preview: request.type === "preview", root, fetcher: options.fetcher });
    const monitors = await loadMonitors({ root, asOf, history: update.history, statuses: update.statuses, preview: request.type === "preview" });
    await atomicWrite(path.join(root, "monitors/latest.json"), z.array(MonitorResultSchema), monitors.results);
    const runs = {} as Record<StrategySymbol, RunResult>;
    for (const symbol of STRATEGY_SYMBOLS) {
      const dir = strategyRoot(root, symbol), pair = { symbol, reference: STRATEGIES[symbol].reference }, relevant = new Set(strategySymbols(symbol));
      const rules = strategyRules(base, symbol, knownSplits);
      const snapshots = await readJson(path.join(dir, "portfolio/entries.json"), PortfolioEntriesSchema);
      const features = buildFeatures(update.history, rules, pair);
      // Only this ticker's own inputs can block its recommendations.
      const issues = update.issues.filter(i => i.symbol === null || relevant.has(i.symbol)), statuses = update.statuses.filter(s => relevant.has(s.symbol));
      const run = attachMonitor(analyzeRun({ type: request.type, timestamp: now.toISOString(), asOf }, features, rules, update.history, snapshots, issues, statuses, pair), monitors.results.find(m => m.symbol === symbol));
      try {
        await persistRun(run, dir, request.type, asOf, root, symbol, features, knownSplits);
      } catch (error) { failures.push([dir, run]); throw error; }
      runs[symbol] = run;
    }
    return runs[request.symbol ?? DEFAULT_STRATEGY];
  } catch (error) {
    for (const [dir, candidate] of failures) {
      const failed: RunResult = { ...candidate, gate: null, core: null, put: null, openPutActions: [], freshness: { ...candidate.freshness, status: "blocked", actionsBlocked: true, issues: [...candidate.freshness.issues, dataIssue("history", null, "Run persistence or nightly replay failed; previous valid final retained. See server log.")] } };
      try {
        await atomicWrite(path.join(dir, "runs", `${asOf}_${request.type}.failed.json`), RunResultSchema, failed);
        await atomicWrite(path.join(dir, "runs/last-attempt.json"), RunResultSchema, failed);
      } catch (writeError) { console.error("[runs] Could not persist failure status", writeError); }
    }
    throw error;
  } finally { runtime.strategyRunLocks.delete(root); }
}
async function persistRun(run: RunResult, dir: string, type: RunResult["type"], asOf: string, root: string, symbol: StrategySymbol, features: ReturnType<typeof buildFeatures>, knownSplits: Record<string, { date: string; factor: number }[]>) {
  if (type !== "preview") run.changesSincePreview = previewChanges(await readOptionalRun(path.join(dir, "runs", `${asOf}_preview.json`)), run);
  const suffix = type !== "preview" && run.freshness.status === "blocked" ? `${type}.failed` : type;
  if (type !== "final" || run.freshness.status === "blocked") await atomicWrite(path.join(dir, "runs", `${asOf}_${suffix}.json`), RunResultSchema, run);
  await atomicWrite(path.join(dir, "runs/last-attempt.json"), RunResultSchema, run);
  if (type !== "preview" && run.freshness.status === "valid") {
    const latest = await readOptionalRun(path.join(dir, "runs/latest.json"));
    // Same pure replay used by parity, never account holdings or manual kill overlay.
    if (!latest || latest.asOf <= asOf) for (const [id, file] of [["v3_1", "v3_1.json"], ["v3_archived", "archive/v3.json"]] as const) {
      const cfg = strategyRules(await readJson(path.join(root, "config/rules", file), RulesSchema), symbol, knownSplits);
      // Both configs replay on the live feature rows, as before. Young tickers start at their first warmed-up row.
      const start = features[0] && features[0].date > "2018-01-01" ? features[0].date : "2018-01-01";
      const actual = replay(features, cfg, { start, end: asOf, capital: 1_000_000 });
      const stats = summarize(actual.days, features, actual.trades, id);
      await atomicWrite(path.join(dir, "backtest", `${id}.json`), BacktestResultSchema, { schemaVersion: 1, rulesId: id, start, end: asOf, capital: 1_000_000, days: actual.days, trades: actual.trades, coreTrades: actual.coreTrades, entries: actual.entries, ...stats });
    }
    // Catch-up records its own type and also fulfills the canonical final slot.
    await atomicWrite(path.join(dir, "runs", `${asOf}_final.json`), RunResultSchema, run);
    if (!latest || latest.asOf <= asOf) await atomicWrite(path.join(dir, "runs/latest.json"), RunResultSchema, run);
  }
}
export const JobOutcomeSchema = z.strictObject({ status: z.enum(["skipped", "completed", "blocked"]), reason: z.string(), runId: z.string().nullable() });
export async function runScheduled(type: "preview" | "final" | "catchup", options: { now?: Date; root?: string; fetcher?: Fetcher } = {}) {
  const now = options.now ?? new Date(), root = options.root ?? dataRoot(), today = marketDate(now);
  if (!session(today)) return JobOutcomeSchema.parse({ status: "skipped", reason: "NYSE closed", runId: null });
  const date = type === "catchup" ? previousSession(today) : today;
  if (type === "catchup") {
    // Skip only when every ticker already has a final for that session that wasn't blocked by missing or
    // malformed market data. "schema" covers Yahoo's transient null/partial daily bars, which Yahoo back-fills later.
    const finals = await Promise.all(STRATEGY_SYMBOLS.map(async symbol => {
      const dir = strategyRoot(root, symbol);
      for (const name of ["final", "final.failed", "catchup.failed"]) { const run = await readOptionalRun(path.join(dir, "runs", `${date}_${name}.json`)); if (run) return run; }
      return null;
    }));
    const settled = finals.every(f => f && (f.freshness.status === "valid" || !f.freshness.issues.some(i => i.blocking && ["fetch", "stale", "partial", "schema"].includes(i.code))));
    if (settled) return JobOutcomeSchema.parse({ status: "skipped", reason: "Previous session final exists", runId: finals[0]!.id });
  }
  const run = await createRun({ type, date }, { ...options, now, root });
  return JobOutcomeSchema.parse({ status: run.freshness.status === "blocked" ? "blocked" : "completed", reason: run.freshness.status, runId: run.id });
}
