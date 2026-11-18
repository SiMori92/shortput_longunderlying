import type { Rules } from "../schemas/config";
import type { Feature, Gate } from "./types";
import { rollingMean } from "./statistics";
export function evaluateGate(row: Feature, rules: Rules, fast: number | null = row.REF_SMA50, slow: number | null = row.REF_SMA200): Gate {
  const a = slow !== null && row.REF > slow;
  const b = fast !== null && slow !== null && fast > slow;
  // Equality at 1.6 passes: Python tests >, not >=.
  const c = !(row.RV60 > 0 && row.RV10 / row.RV60 > rules.rvSpike);
  return rules.gateMode === "risk-cut" ? { a, b, c, gateOn: b && c, mult: a ? 1 : rules.riskCutMultiplier, putOk: a }
    : { a, b, c, gateOn: a && b && c, mult: 1, putOk: true };
}
export function prepareGates(features: readonly Feature[], rules: Rules): Gate[] {
  if (rules.gateMode !== "risk-cut") return features.map(row => evaluateGate(row, rules));
  // Exact riskcut_v3.prepare behavior: re-roll after feature warm-up has been dropped.
  const ref = features.map(r => r.REF), fast = rollingMean(ref, rules.smaFast), slow = rollingMean(ref, rules.smaSlow);
  return features.map((row, i) => evaluateGate(row, rules, fast[i]!, slow[i]!));
}
export function gateState(gate: Gate, drawdown: number | null, rules: Rules): "ON" | "RISK CUT" | "OFF" | "KILL" {
  if (drawdown !== null && drawdown <= rules.killDrawdown) return "KILL";
  return !gate.gateOn ? "OFF" : gate.mult < 1 ? "RISK CUT" : "ON";
}
/** Manual-review overlay. It never mutates the backtest loop. */
export function liveRiskPolicy(gate: Gate, drawdown: number | null, rules: Rules) {
  const state = gateState(gate, drawdown, rules);
  return { state, allowCoreIncrease: state !== "KILL" && gate.gateOn, allowNewPut: state !== "KILL" && gate.gateOn && gate.putOk };
}
