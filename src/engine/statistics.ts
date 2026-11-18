export function mean(xs: readonly number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
export function sampleStd(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const avg = mean(xs); return Math.sqrt(xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (xs.length - 1));
}
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b); const index = (sorted.length - 1) * q; const lo = Math.floor(index); const fraction = index - lo;
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * fraction;
}
export function rollingMean(xs: readonly number[], n: number): (number | null)[] {
  return xs.map((_, i) => i + 1 < n ? null : mean(xs.slice(i + 1 - n, i + 1)));
}
export function realizedVolatility(closes: readonly number[], n: number): (number | null)[] {
  const logs = closes.map(Math.log);
  const returns = logs.map((v, i) => i === 0 ? NaN : v - logs[i - 1]!);
  return returns.map((_, i) => i < n ? null : sampleStd(returns.slice(i + 1 - n, i + 1)) * Math.sqrt(252));
}
