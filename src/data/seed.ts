import { MonitorConfigsSchema, ObservationsSchema } from "../schemas/monitor";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { z } from "zod";
import { BarsSchema, type Bars } from "../schemas/bars";
import { RulesSchema, UnderlyingsSchema } from "../schemas/config";
import { KnownSplitsSchema } from "../schemas/market";
import { JournalSchema, PortfolioEntriesSchema } from "../schemas/portfolio";
import { atomicWrite, dataRoot, isMissing, readJson } from "./store";
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
export async function seedData(root = dataRoot(), source = process.cwd()) {
  const underlyings = await initialize(path.join(root, "config/underlyings.json"), UnderlyingsSchema, () => readJson(path.join(source, "config/underlyings.json"), UnderlyingsSchema));
  for (const rule of ["v3_1.json", "archive/v3.json"]) await initialize(path.join(root, "config/rules", rule), RulesSchema, () => readJson(path.join(source, "config/rules", rule), RulesSchema));
  await initialize(path.join(root, "config/known-splits.json"), KnownSplitsSchema, () => readJson(path.join(source, "config/known-splits.json"), KnownSplitsSchema));
  await initialize(path.join(root, "config/monitors.json"), MonitorConfigsSchema, () => readJson(path.join(source, "config/monitors.json"), MonitorConfigsSchema));
  await initialize(path.join(root, "monitors/observations.json"), ObservationsSchema, async () => []);
  const counts: Record<string, number> = {};
  for (const underlying of underlyings) {
    if (!underlying.seedFile) continue;
    const bars = await initialize(path.join(root, "bars", `${underlying.symbol}.json`), BarsSchema, async () => parseSeedCsv(await readFile(path.join(source, "seed/bars", underlying.seedFile!), "utf8"), underlying.symbol));
    if (bars.symbol !== underlying.symbol) throw new Error(`Stored symbol mismatch: ${underlying.symbol}`);
    counts[underlying.symbol] = bars.bars.length;
  }
  await initialize(path.join(root, "portfolio/entries.json"), PortfolioEntriesSchema, async () => []);
  await initialize(path.join(root, "portfolio/journal.json"), JournalSchema, async () => []);
  return counts;
}
