"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { STRATEGIES, STRATEGY_COOKIE, STRATEGY_SYMBOLS, type StrategySymbol } from "@/strategy/symbols";
function remember(symbol: StrategySymbol) { document.cookie = `${STRATEGY_COOKIE}=${symbol}; path=/; max-age=31536000; samesite=lax`; }
/** Picks the ticker every page renders for. Stored as a 1-year, non-sensitive preference cookie. */
export function StrategySwitcher({ symbol }: { symbol: StrategySymbol }) {
  const router = useRouter(), [pending, start] = useTransition();
  function pick(next: StrategySymbol) {
    if (next === symbol) return;
    remember(next);
    start(() => router.refresh());
  }
  return <div className="segmented strategy-switcher" role="group" aria-label="Ticker" aria-busy={pending}>
    {STRATEGY_SYMBOLS.map(s => <button key={s} type="button" aria-pressed={s === symbol} title={`${s} · ${STRATEGIES[s].name} · reference ${STRATEGIES[s].reference}`} onClick={() => pick(s)}>{s}</button>)}
  </div>;
}
