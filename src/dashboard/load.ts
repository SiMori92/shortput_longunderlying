import { currentAccountRun } from "../portfolio/basis";
import path from "node:path";
import { cache } from "react";
import { dataRoot, readJson } from "../data/store";
import { BarsSchema } from "../schemas/bars";
import { RulesSchema } from "../schemas/config";
import { PortfolioEntriesSchema } from "../schemas/portfolio";
import { buildFeatures, type History } from "../engine";
import { readOptionalRun } from "../runs/service";
import { expectedClose } from "../market/calendar";
import { actionsAvailable, gateEpisodes, gateSeries } from "./model";
/** Stored history is context, never evidence that a market validation passed. */
export const loadDashboard = cache(async () => {
  const root = dataRoot();
  const [rules, storedRun, snapshots, ...bars] = await Promise.all([
    readJson(path.join(root, "config/rules/v3_1.json"), RulesSchema),
    readOptionalRun(path.join(root, "runs/last-attempt.json")),
    readJson(path.join(root, "portfolio/entries.json"), PortfolioEntriesSchema),
    ...["SOXL", "SOXX", "SPY", "^VIX", "^IRX"].map(s => readJson(path.join(root, `bars/${s}.json`), BarsSchema)),
  ]);
  const run = currentAccountRun(storedRun, snapshots);
  const ends = bars.map(b => b.bars.at(-1)?.date).filter((s): s is string => !!s);
  const cutoff = ends.length === bars.length ? ends.sort()[0]! : "2010-01-01";
  for (const [i, symbol] of ["SOXL", "SOXX", "SPY", "^VIX", "^IRX"].entries()) if (bars[i]?.symbol !== symbol) throw new Error(`Stored symbol mismatch: ${symbol}`);
  const history: History = Object.fromEntries(bars.map(b => [b.symbol, b.bars.filter(r => r.date <= cutoff)]));
  const features = buildFeatures(history, rules), series = gateSeries(features, rules);
  const snapshot = run ? snapshots.find(s => s.date === run.asOf) : undefined;
  return { rules, run, snapshots, snapshot, features, series, episodes: gateEpisodes(series), cutoff, available: actionsAvailable(run, expectedClose(new Date())) };
});
