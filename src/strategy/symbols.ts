import { z } from "zod";
/** Client-safe strategy registry. Each ticker runs the same V3.1 rules against its own reference. */
export const STRATEGY_SYMBOLS = ["SOXL", "SPAX"] as const;
export const StrategySymbolSchema = z.enum(STRATEGY_SYMBOLS);
export type StrategySymbol = z.infer<typeof StrategySymbolSchema>;
export const DEFAULT_STRATEGY: StrategySymbol = "SOXL";
/** Non-sensitive UI preference; not a security boundary. */
export const STRATEGY_COOKIE = "strategy_symbol";
export interface Strategy { symbol: StrategySymbol; reference: string; leverage: number; name: string }
export const STRATEGIES: Record<StrategySymbol, Strategy> = {
  SOXL: { symbol: "SOXL", reference: "SOXX", leverage: 3, name: "Semiconductor 3×" },
  SPAX: { symbol: "SPAX", reference: "SPCX", leverage: 2, name: "SPCX 2×" },
};
export const INPUT_SYMBOLS = ["SPY", "^VIX", "^IRX"] as const;
export function parseStrategy(value: string | null | undefined): StrategySymbol {
  const parsed = StrategySymbolSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_STRATEGY;
}
/** Symbols whose validation can block this strategy's recommendations. */
export function strategySymbols(symbol: StrategySymbol): string[] { return [symbol, STRATEGIES[symbol].reference, ...INPUT_SYMBOLS]; }
/** API routes: explicit ?symbol= wins, then the UI selection cookie, then SOXL. */
export function requestStrategy(request: Request): StrategySymbol {
  const explicit = new URL(request.url).searchParams.get("symbol");
  if (explicit !== null) return parseStrategy(explicit);
  const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${STRATEGY_COOKIE}=`));
  return parseStrategy(cookie?.slice(STRATEGY_COOKIE.length + 1));
}
