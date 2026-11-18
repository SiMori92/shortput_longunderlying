import path from "node:path";
import { z } from "zod";
import { atomicWrite, dataRoot, isMissing, readJson } from "../data/store";
import { BarsSchema } from "../schemas/bars";
import { KnownGapsSchema, KnownSplitsSchema, MarketFactsSchema, SymbolStatusSchema, type DataIssue } from "../schemas/market";
import { MonitorConfigsSchema } from "../schemas/monitor";
import { UnderlyingsSchema } from "../schemas/config";
import type { History } from "../engine/types";
import { dataIssue, validateUpdate } from "./validation";
import { fetchChart, type Fetcher } from "./yahoo";
export async function updateMarket(options: { now: Date; asOf: string; preview: boolean; root?: string; fetcher?: Fetcher }) {
  const root = options.root ?? dataRoot();
  const underlyings = await readJson(path.join(root, "config/underlyings.json"), UnderlyingsSchema);
  const monitorConfigs = await readJson(path.join(root, "config/monitors.json"), MonitorConfigsSchema);
  const known = await readJson(path.join(root, "config/known-splits.json"), KnownSplitsSchema);
  let gaps: z.infer<typeof KnownGapsSchema> = {};
  try { gaps = await readJson(path.join(root, "config/known-gaps.json"), KnownGapsSchema); } catch (e) { if (!isMissing(e)) throw e; }
  const history: History = {}, statuses: z.infer<typeof SymbolStatusSchema>[] = [];
  // Two concurrent provider calls; no account, holdings, cookies or secrets are sent.
  for (let i = 0; i < underlyings.length; i += 2) {
    await Promise.all(underlyings.slice(i, i + 2).map(async u => {
      let bars: z.infer<typeof BarsSchema>["bars"] = [];
      try { const stored = await readJson(path.join(root, "bars", `${u.symbol}.json`), BarsSchema); if (stored.symbol !== u.symbol) throw new Error(`Stored symbol mismatch: ${u.symbol}`); bars = stored.bars; }
      catch (e) { if (!isMissing(e)) throw e; }
      let issues: DataIssue[] = [], provisional = false, updated = false;
      try {
        const { chart, url } = await fetchChart(u.symbol, bars.at(-1)?.date, options.now, options.fetcher);
        const result = validateUpdate(u.symbol, bars, chart, { ...options, knownSplits: known[u.symbol] ?? [], knownGaps: gaps[u.symbol] ?? [], reference: u.role === "reference" || u.symbol === "SPY" });
        issues = result.issues;
        provisional = result.provisional;
        if (result.acceptable && result.stored) {
          await atomicWrite(path.join(root, "bars", `${u.symbol}.json`), BarsSchema, result.stored);
          updated = result.stored.bars.length !== bars.length;
          history[u.symbol] = result.view;
        } else history[u.symbol] = bars.filter(b => b.date <= options.asOf);
        if (monitorConfigs.some(c => c.symbol === u.symbol)) {
          const terms = monitorConfigs.find(c => c.symbol === u.symbol)?.identityTerms;
          const last = result.view.at(-1), named = !!terms?.length && terms.every(t => (chart.meta.longName ?? "").toUpperCase().includes(t.toUpperCase())) && chart.meta.instrumentType === "ETF";
          await atomicWrite(path.join(root, "facts", `${u.symbol}.json`), MarketFactsSchema, {
            checkedAt: options.now.toISOString(), symbol: u.symbol, yahooSymbol: named ? { value: u.symbol, source: url } : "unconfirmed",
            volume: last && result.acceptable ? { value: last.volume, asOf: last.date, source: url } : "unconfirmed",
            launchDate: "unconfirmed", issuer: "unconfirmed", expenseRatio: "unconfirmed", listedOptions: "unconfirmed", aum: "unconfirmed",
            warnings: ["Launch date, legal issuer, fee, listed options and AUM unconfirmed; Yahoo firstTradeDate is not proof of launch.", ...(!named ? [`${u.symbol} instrument identity unconfirmed`] : []), ...issues.map(i => i.message)],
          });
        }
      } catch (e) {
        issues = [dataIssue("fetch", u.symbol, e instanceof Error ? e.message : String(e))];
        history[u.symbol] = bars.filter(b => b.date <= options.asOf);
      }
      statuses.push(SymbolStatusSchema.parse({ symbol: u.symbol, lastDate: history[u.symbol]?.at(-1)?.date ?? null, expectedDate: options.asOf, count: history[u.symbol]?.length ?? 0, provisional, updated, issues }));
    }));
  }
  statuses.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const status = z.strictObject({ timestamp: z.iso.datetime(), asOf: z.iso.date(), symbols: z.array(SymbolStatusSchema) });
  await atomicWrite(path.join(root, "updates/latest.json"), status, { timestamp: options.now.toISOString(), asOf: options.asOf, symbols: statuses });
  return { history, statuses, issues: statuses.flatMap(s => s.issues) };
}
