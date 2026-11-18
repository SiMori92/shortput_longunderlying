import { BarSchema, BarsSchema } from "../schemas/bars";
import type { Bar } from "../engine/types";
import type { DataIssue } from "../schemas/market";
import { marketDate, marketMinute, session, sessions } from "./calendar";
import type { YahooChart } from "./yahoo";
export const dataIssue = (code: DataIssue["code"], symbol: string | null, message: string, blocking = true): DataIssue => ({ code, symbol, message, blocking });
export function canAcceptToday(chart: YahooChart, now: Date): boolean {
  if (marketMinute(now) >= 16 * 60 + 15) return true;
  const regular = chart.meta.currentTradingPeriod?.regular;
  // Meta must describe TODAY, not a previous session whose end is already past.
  return !!regular && marketDate(new Date(regular.start * 1000)) === marketDate(now) && now.getTime() >= regular.end * 1000;
}
export function validateUpdate(symbol: string, existing: readonly Bar[], chart: YahooChart, options: {
  now: Date; asOf: string; preview: boolean; knownSplits: readonly { date: string; factor: number }[]; reference: boolean;
}) {
  const issues: DataIssue[] = [], today = marketDate(options.now), finalToday = canAcceptToday(chart, options.now);
  for (const split of Object.values(chart.events?.splits ?? {})) {
    const d = new Date(split.date * 1000).toISOString().slice(0, 10), factor = split.numerator / split.denominator;
    if (!options.knownSplits.some(s => s.date === d && Math.abs(s.factor - factor) < 1e-10)) issues.push(dataIssue("split", symbol, `Unreviewed ${symbol} split ${d} ×${factor}`));
  }
  const times = chart.timestamp ?? [], quote = chart.indicators.quote[0], adjusted = chart.indicators.adjclose?.[0]?.adjclose;
  if (!quote || Object.values(quote).some(v => v.length !== times.length) || (adjusted && adjusted.length !== times.length)) issues.push(dataIssue("schema", symbol, "Yahoo daily array lengths disagree"));
  const complete: Bar[] = []; let provisional: Bar | null = null;
  const seen = new Set<string>();
  if (quote) for (let i = 0; i < times.length; i++) {
    // Yahoo US INDEX daily timestamps can be 00:00 UTC (VIX/IRX),
    // while ETF bars use the session open. Daily date labels use UTC date.
    const d = new Date(times[i]! * 1000).toISOString().slice(0, 10);
    if (d > options.asOf) continue;
    if (seen.has(d)) { issues.push(dataIssue("schema", symbol, `Duplicate daily bar ${d}`)); continue; } seen.add(d);
    if (d === today && !finalToday && !options.preview) { issues.push(dataIssue("partial", symbol, `Rejected partial bar ${d}; final requires 16:15 ET or same-day regular-session end metadata`)); continue; }
    const live = d === today && options.preview && !finalToday;
    if (live && (chart.meta.regularMarketTime === undefined || marketDate(new Date(chart.meta.regularMarketTime * 1000)) !== today || options.now.getTime() - chart.meta.regularMarketTime * 1000 > 30 * 60 * 1000 || chart.meta.regularMarketTime * 1000 > options.now.getTime() + 60000 || marketMinute(options.now) < 570)) {
      issues.push(dataIssue("stale", symbol, "Preview quote is missing, stale or outside the regular session")); continue;
    }
    const parsed = BarSchema.safeParse({ date: d, open: quote.open[i], high: quote.high[i], low: quote.low[i], close: live ? chart.meta.regularMarketPrice : quote.close[i], volume: quote.volume[i], adjclose: adjusted?.[i] ?? null });
    if (!parsed.success) { issues.push(dataIssue("schema", symbol, `Incomplete/invalid OHLCV at ${d}`)); continue; }
    if (symbol !== "^IRX" && [parsed.data.open, parsed.data.high, parsed.data.low, parsed.data.close].some(p => p <= 0)) { issues.push(dataIssue("schema", symbol, `Nonpositive price at ${d}`)); continue; }
    try { if (!session(d) && !symbol.startsWith("^")) { issues.push(dataIssue("calendar", symbol, `Bar on non-NYSE session ${d}`)); continue; } }
    catch (e) { issues.push(dataIssue("calendar", symbol, String(e))); continue; }
    if (live) provisional = parsed.data; else complete.push(parsed.data);
  }
  const old = new Map(existing.map(b => [b.date, b])); let overlaps = 0;
  for (const bar of complete) {
    const prior = old.get(bar.date); if (!prior) continue; overlaps++;
    if (Math.abs(bar.close - prior.close) / Math.max(Math.abs(prior.close), 1e-12) > .005) issues.push(dataIssue("stitch", symbol, `Seed/Yahoo close mismatch >0.5% at ${bar.date}: ${prior.close} vs ${bar.close}`));
  }
  if (existing.length && complete.some(b => b.date > existing.at(-1)!.date) && !overlaps) issues.push(dataIssue("stitch", symbol, "Yahoo update has no overlap with stored history"));
  // Keep immutable seed/previous accepted overlap values; append only new days.
  for (const b of complete) if (!old.has(b.date)) old.set(b.date, b);
  const merged = [...old.values()].sort((a, b) => a.date.localeCompare(b.date));
  const view = merged.filter(b => b.date <= options.asOf);
  if (provisional) { const i = view.findIndex(b => b.date === provisional!.date); if (i >= 0) view[i] = provisional; else view.push(provisional); }
  if (options.reference) for (let i = 1; i < view.length; i++) if (Math.abs(view[i]!.close / view[i - 1]!.close - 1) > .4) issues.push(dataIssue("move", symbol, `Reference daily move >40% at ${view[i]!.date}`));
  if (view.length) {
    // Audit all history from the first actual bar. No synthetic holiday/session fills.
    try {
      const dates = new Set(view.map(b => b.date)); const missing = sessions(view[0]!.date, options.asOf).filter(d => !dates.has(d));
      if (missing.length) issues.push(dataIssue("missing", symbol, `${missing.length} missing NYSE sessions: ${missing.slice(-8).join(", ")}`));
    } catch (e) { issues.push(dataIssue("calendar", symbol, String(e))); }
  }
  if (view.at(-1)?.date !== options.asOf) issues.push(dataIssue("stale", symbol, `Latest ${view.at(-1)?.date ?? "unconfirmed"}; expected ${options.asOf}`));
  const validated = BarsSchema.safeParse({ schemaVersion: 1, symbol, source: "yahoo", bars: merged });
  if (!validated.success) issues.push(dataIssue("schema", symbol, "Merged bars failed schema validation"));
  return { stored: validated.success ? validated.data : null, view, provisional: provisional !== null, issues, acceptable: !issues.some(i => i.blocking) };
}
