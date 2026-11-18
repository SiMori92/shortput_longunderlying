import { currentAccountRun } from "../portfolio/basis";
import path from "node:path";
import { cache } from "react";
import { dataRoot, isMissing, readJson } from "../data/store";
import { BarsSchema } from "../schemas/bars";
import { RulesSchema } from "../schemas/config";
import { KnownSplitsSchema } from "../schemas/market";
import { PortfolioEntriesSchema } from "../schemas/portfolio";
import { buildFeatures, type History } from "../engine";
import { readOptionalRun } from "../runs/service";
import { expectedClose } from "../market/calendar";
import { DEFAULT_STRATEGY, STRATEGIES, strategySymbols, type StrategySymbol } from "../strategy/symbols";
import { strategyRoot, strategyRules } from "../strategy/paths";
import { actionsAvailable, gateEpisodes, gateSeries } from "./model";
async function storedBars(root: string, symbol: string) {
  try { const b = await readJson(path.join(root, `bars/${symbol}.json`), BarsSchema); if (b.symbol !== symbol) throw new Error(`Stored symbol mismatch: ${symbol}`); return b.bars; }
  catch (e) { if (isMissing(e)) return []; throw e; }
}
/** Stored history is context, never evidence that a market validation passed. */
export const loadDashboard = cache(async (symbol: StrategySymbol = DEFAULT_STRATEGY) => {
  const root = dataRoot(), dir = strategyRoot(root, symbol), strategy = STRATEGIES[symbol], symbols = strategySymbols(symbol);
  const [base, knownSplits, storedRun, snapshots, ...bars] = await Promise.all([
    readJson(path.join(root, "config/rules/v3_1.json"), RulesSchema),
    readJson(path.join(root, "config/known-splits.json"), KnownSplitsSchema),
    readOptionalRun(path.join(dir, "runs/last-attempt.json")),
    readJson(path.join(dir, "portfolio/entries.json"), PortfolioEntriesSchema).catch(e => { if (isMissing(e)) return []; throw e; }),
    ...symbols.map(s => storedBars(root, s)),
  ]);
  const rules = strategyRules(base, symbol, knownSplits);
  const run = currentAccountRun(storedRun, snapshots);
  const ends = bars.map(b => b.at(-1)?.date).filter((s): s is string => !!s);
  const cutoff = ends.length === bars.length ? ends.sort()[0]! : bars[0]?.at(-1)?.date ?? "Unconfirmed";
  const history: History = Object.fromEntries(symbols.map((s, i) => [s, bars[i]!.filter(r => r.date <= cutoff)]));
  const features = buildFeatures(history, rules, { symbol, reference: strategy.reference }), series = gateSeries(features, rules);
  const snapshot = run ? snapshots.find(s => s.date === run.asOf) : undefined;
  const sessions = { symbol: history[symbol]?.length ?? 0, reference: history[strategy.reference]?.length ?? 0 };
  return { symbol, strategy, rules, run, snapshots, snapshot, features, series, episodes: gateEpisodes(series), cutoff, sessions, available: actionsAvailable(run, expectedClose(new Date())) };
});
