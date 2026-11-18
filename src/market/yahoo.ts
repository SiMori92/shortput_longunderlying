import { YahooChartSchema } from "../schemas/yahoo";
import { shiftDate } from "../engine/dates";
export type YahooChart = NonNullable<ReturnType<typeof YahooChartSchema.parse>["chart"]["result"]>[number];
export type Fetcher = typeof fetch;
export function chartUrl(symbol: string, lastDate: string | undefined, now: Date): string {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", "1d"); url.searchParams.set("events", "split");
  if (lastDate) {
    url.searchParams.set("period1", String(Date.parse(`${shiftDate(lastDate, -14)}T00:00:00Z`) / 1000));
    url.searchParams.set("period2", String(Math.floor(now.getTime() / 1000) + 86400));
  } else url.searchParams.set("range", "max");
  return url.toString();
}
export async function fetchChart(symbol: string, lastDate: string | undefined, now: Date, fetcher: Fetcher = fetch): Promise<{ chart: YahooChart; url: string }> {
  const url = chartUrl(symbol, lastDate, now);
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try { response = await fetcher(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000), cache: "no-store", redirect: "error" }); }
    catch (e) { if (attempt >= 2) throw e; await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)); continue; }
    if (!response.ok) {
      if (attempt < 2 && (response.status === 429 || response.status >= 500)) { await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt)); continue; }
      throw new Error(`Yahoo HTTP ${response.status} for ${symbol}`);
    }
    const payload = YahooChartSchema.parse(await response.json());
    if (payload.chart.error) throw new Error(`Yahoo ${payload.chart.error.code}: ${payload.chart.error.description}`);
    if (payload.chart.result?.length !== 1) throw new Error(`Yahoo returned no unique result for ${symbol}`);
    const chart = payload.chart.result[0]!;
    if (chart.meta.symbol !== symbol || !["America/New_York", "America/Chicago"].includes(chart.meta.exchangeTimezoneName)) throw new Error(`Yahoo identity/timezone mismatch for ${symbol}`);
    return { chart, url };
  }
}
