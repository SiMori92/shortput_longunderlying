import type { Rules } from "../schemas/config";
import type { Feature, History } from "./types";
import { realizedVolatility, rollingMean } from "./statistics";
import { weekId } from "./dates";
export function buildFeatures(history: History, rules: Rules): Feature[] {
  const base = history.SOXL ?? [];
  // Join exactly on SOXL dates, then forward-fill. An off-axis reference observation
  // must not leak into the join (pandas left join + ffill, not an as-of join).
  const refs = ["SOXX", "SPY", "^VIX", "^IRX"].map(s => new Map((history[s] ?? []).map(b => [b.date, b.close])));
  const last: (number | undefined)[] = Array(4).fill(undefined);
  const joined = base.flatMap(bar => {
    refs.forEach((map, i) => { const value = map.get(bar.date); if (value !== undefined) last[i] = value; });
    if (last.some(v => v === undefined)) return [];
    if (!(bar.close > 0)) throw new Error("SOXL close must be positive");
    return [{ date: bar.date, S: bar.close, H: bar.high, L: bar.low, REF: last[0]!, SPY: last[1]!, VIX: last[2]! / 100, RF: last[3]! / 100 }];
  });
  const closes = joined.map(r => r.S); const reference = joined.map(r => r.REF);
  const rv10 = realizedVolatility(closes, 10), rv20 = realizedVolatility(closes, 20), rv60 = realizedVolatility(closes, 60);
  const fast = rollingMean(reference, rules.smaFast), slow = rollingMean(reference, rules.smaSlow);
  const features = joined.flatMap((r, i) => {
    if (rv20[i] == null || rv60[i] == null || slow[i] == null) return [];
    const factor = rules.splits.reduce((f, split) => r.date < split.date ? f * split.factor : f, 1);
    return [{ ...r, RV10: rv10[i]!, RV20: rv20[i]!, RV60: rv60[i]!, RVfast: Math.max(rv10[i]!, rv20[i]!),
      IV_ATM: Math.min(rules.ivMax, Math.max(rules.ivMin, rules.ivPremium * (0.5 * rv20[i]! + 0.5 * rv60[i]!))),
      REF_SMA50: fast[i]!, REF_SMA200: slow[i]!, S_SMA20: null, S_SMA50: null, S_SMA100: null,
      unadj: r.S * factor, week_id: weekId(r.date), is_expiry: i === joined.length - 1 || weekId(joined[i + 1]!.date) !== weekId(r.date),
    } satisfies Feature];
  });
  // risk_v3.prep adds these AFTER build_features has dropped warm-up rows.
  const s = features.map(r => r.S), m20 = rollingMean(s, 20), m50 = rollingMean(s, 50), m100 = rollingMean(s, 100);
  return features.map((r, i) => ({ ...r, S_SMA20: m20[i]!, S_SMA50: m50[i]!, S_SMA100: m100[i]! }));
}
