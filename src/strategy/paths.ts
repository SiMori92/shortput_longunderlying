import path from "node:path";
import type { Rules } from "../schemas/config";
import { DEFAULT_STRATEGY, type StrategySymbol } from "./symbols";
/** SOXL keeps the original data layout; other tickers live under strategies/<SYMBOL>/. */
export function strategyRoot(root: string, symbol: StrategySymbol): string {
  return symbol === DEFAULT_STRATEGY ? root : path.join(root, "strategies", symbol);
}
/** Shared V3.1 parameters; split factors (commission scaling) come from the ticker's own reviewed splits. */
export function strategyRules(rules: Rules, symbol: StrategySymbol, knownSplits: Record<string, { date: string; factor: number }[]>): Rules {
  return symbol === DEFAULT_STRATEGY ? rules : { ...rules, splits: knownSplits[symbol] ?? [] };
}
