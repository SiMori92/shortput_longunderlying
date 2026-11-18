import { z } from "zod";
const numbers = z.array(z.number().finite().nullable());
export const YahooChartSchema = z.object({ chart: z.object({
  error: z.object({ code: z.string(), description: z.string() }).nullable(),
  result: z.array(z.object({
    meta: z.object({ symbol: z.string(), exchangeTimezoneName: z.string(), regularMarketTime: z.number().int().optional(), regularMarketPrice: z.number().finite().optional(), instrumentType: z.string().optional(), longName: z.string().optional(), shortName: z.string().optional(), firstTradeDate: z.number().int().optional(), currentTradingPeriod: z.object({ regular: z.object({ start: z.number().int(), end: z.number().int() }) }).optional() }),
    timestamp: z.array(z.number().int()).optional(),
    indicators: z.object({ quote: z.array(z.object({ open: numbers, high: numbers, low: numbers, close: numbers, volume: numbers })), adjclose: z.array(z.object({ adjclose: numbers })).optional() }),
    events: z.object({ splits: z.record(z.string(), z.object({ date: z.number().int(), numerator: z.number().positive(), denominator: z.number().positive(), splitRatio: z.string() })).optional() }).optional(),
  })).nullable(),
}) });
