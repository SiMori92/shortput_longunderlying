import { normalCdf } from "./normal";
export function bsPut(S: number, K: number, T: number, r: number, iv: number): number {
  if (T <= 0) return Math.max(K - S, 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * iv ** 2) * T) / (iv * Math.sqrt(T)); const d2 = d1 - iv * Math.sqrt(T);
  return K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
}
export function putDelta(S: number, K: number, T: number, r: number, iv: number): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * iv ** 2) * T) / (iv * Math.sqrt(T)); return normalCdf(d1) - 1;
}
export function skewedIv(atm: number, S: number, K: number, skew: number): number { return atm * (1 + skew * Math.max(-Math.log(K / S), 0)); }
export function strikeForDelta(S: number, T: number, r: number, atm: number, skew: number, target: number): number {
  let lo = S * 0.3, hi = S, K = 0;
  for (let i = 0; i < 60; i++) {
    K = 0.5 * (lo + hi); const d = putDelta(S, K, T, r, skewedIv(atm, S, K, skew));
    if (-d > target) hi = K; else lo = K;
  }
  return K;
}
