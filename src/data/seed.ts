import { MonitorConfigsSchema, ObservationsSchema } from "../schemas/monitor";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { z } from "zod";
import { BarsSchema, type Bars } from "../schemas/bars";
import { RulesSchema, UnderlyingsSchema } from "../schemas/config";
import { KnownGapsSchema, KnownSplitsSchema } from "../schemas/market";
import { JournalSchema, PortfolioEntriesSchema } from "../schemas/portfolio";
import { atomicWrite, dataRoot, isMissing, readJson } from "./store";
import { STRATEGY_SYMBOLS } from "../strategy/symbols";
import { strategyRoot } from "../strategy/paths";
const numeric = z.string().min(1).transform(Number).pipe(z.number().finite());
const CsvRowSchema = z.object({ date: z.iso.date(), open: numeric, high: numeric, low: numeric, close: numeric, volume: numeric, adjclose: numeric });
export function parseSeedCsv(csv: string, symbol: string): Bars {
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: "greedy", transformHeader: (s, i) => i === 0 ? "date" : s.trim() });
  if (parsed.errors.length) throw new Error(`CSV parse failed for ${symbol}: ${parsed.errors[0]!.message}`);
  return BarsSchema.parse({ schemaVersion: 1, symbol, source: "seed", bars: parsed.data.map(row => CsvRowSchema.parse(row)) });
}
async function initialize<T>(file: string, schema: z.ZodType<T>, create: () => Promise<T>): Promise<T> {
  try { return await readJson(file, schema); } catch (e) { if (!isMissing(e)) throw e; }
  return atomicWrite(file, schema, await create());
}
/** Add reviewed entries shipped with a new release to an existing volume. Never removes or edits entries already on the volume. */
async function mergeReviewed<T extends { date: string }>(file: string, bundled: string, schema: z.ZodType<Record<string, T[]>>): Promise<void> {
  const current = await initialize(file, schema, () => readJson(bundled, schema));
  const shipped = await readJson(bundled, schema);
  let added = 0; const merged: Record<string, T[]> = { ...current };
  for (const [symbol, entries] of Object.entries(shipped)) {
    const have = merged[symbol] ?? [];
    const extra = entries.filter(e => !have.some(h => h.date === e.date));
    if (extra.length) { merged[symbol] = [...have, ...extra].sort((a, b) => a.date.localeCompare(b.date)); added += extra.length; }
  }
  if (added) { await atomicWrite(file, schema, merged); console.info(`[seed] Added ${added} reviewed entr${added === 1 ? "y" : "ies"} to ${path.basename(file)}`); }
}
export async function seedData(root = dataRoot(), source = process.cwd()) {
  const underlyings = await initialize(path.join(root, "config/underlyings.json"), UnderlyingsSchema, () => readJson(path.join(source, "config/underlyings.json"), UnderlyingsSchema));
  for (const rule of ["v3_1.json", "archive/v3.json"]) await initialize(path.join(root, "config/rules", rule), RulesSchema, () => readJson(path.join(source, "config/rules", rule), RulesSchema));
  await mergeReviewed(path.join(root, "config/known-splits.json"), path.join(source, "config/known-splits.json"), KnownSplitsSchema);
  await mergeReviewed(path.join(root, "config/known-gaps.json"), path.join(source, "config/known-gaps.json"), KnownGapsSchema);
  // Add monitor configs for newly supported symbols; never alter a config already on the volume.
  const monitorsFile = path.join(root, "config/monitors.json"), shippedMonitors = await readJson(path.join(source, "config/monitors.json"), MonitorConfigsSchema);
  const monitors = await initialize(monitorsFile, MonitorConfigsSchema, async () => shippedMonitors);
  const newMonitors = shippedMonitors.filter(m => !monitors.some(c => c.symbol === m.symbol));
  if (newMonitors.length) { await atomicWrite(monitorsFile, MonitorConfigsSchema, [...monitors, ...newMonitors]); console.info(`[seed] Added monitor config: ${newMonitors.map(m => m.symbol).join(", ")}`); }
  await initialize(path.join(root, "monitors/observations.json"), ObservationsSchema, async () => []);
  const counts: Record<string, number> = {};
  for (const underlying of underlyings) {
    if (!underlying.seedFile) continue;
    const bars = await initialize(path.join(root, "bars", `${underlying.symbol}.json`), BarsSchema, async () => parseSeedCsv(await readFile(path.join(source, "seed/bars", underlying.seedFile!), "utf8"), underlying.symbol));
    if (bars.symbol !== underlying.symbol) throw new Error(`Stored symbol mismatch: ${underlying.symbol}`);
    counts[underlying.symbol] = bars.bars.length;
  }
  for (const symbol of STRATEGY_SYMBOLS) {
    const dir = strategyRoot(root, symbol);
    await initialize(path.join(dir, "portfolio/entries.json"), PortfolioEntriesSchema, async () => []);
    await initialize(path.join(dir, "portfolio/journal.json"), JournalSchema, async () => []);
  }
  return counts;
}
