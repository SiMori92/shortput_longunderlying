/**
 * Pixel nudges so end labels never collide: values are ordered, then pushed apart to at least `gap` px using the
 * visible value range and the plot height. Returns a dy per series in input order.
 */
export function labelOffsets(values: readonly (number | null | undefined)[], range: readonly [number, number], plotHeight: number, gap = 15, log = false) {
  const f = (v: number) => log ? Math.log(Math.max(v, 1e-9)) : v;
  const [lo, hi] = [f(range[0]), f(range[1])], span = hi - lo || 1;
  const ys = values.map((v, i) => ({ i, y: v == null ? null : plotHeight - (f(v) - lo) / span * plotHeight }));
  const placed = ys.filter((p): p is { i: number; y: number } => p.y !== null).sort((a, b) => a.y - b.y);
  const out = values.map(() => 0);
  let last = -Infinity;
  for (const p of placed) { const y = Math.max(p.y, last + gap); out[p.i] = y - p.y; last = y; }
  return out;
}
