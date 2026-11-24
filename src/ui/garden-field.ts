/**
 * Seeded brushwork in the garden / Brabant / Clichy palette (UI_DESIGN_WORKBOOK.html §1, "painted field").
 * Ported from the workbook's painter. It is static: the same seed paints the same field on every visit,
 * it never animates, and it never draws text. Decoration only; callers mark the canvas aria-hidden.
 */
export type GardenMode = "hero" | "foot";
export type GardenPalette = { d1: string; d2: string; d3: string; d4: string };
/** The subset of CanvasRenderingContext2D the painter uses, so tests can record calls. */
export type PaintContext = Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo" | "stroke" | "fill" | "arc" | "fillRect" | "createLinearGradient"> & {
  strokeStyle: CanvasRenderingContext2D["strokeStyle"]; fillStyle: CanvasRenderingContext2D["fillStyle"];
  lineWidth: number; globalAlpha: number; lineCap: CanvasLineCap;
};
export const DEFAULT_PALETTE: GardenPalette = { d1: "#d1a93a", d2: "#9690c4", d3: "#7f9a7a", d4: "#a2432a" };

/** mulberry32, as in the workbook. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** Stable 32-bit seed for a route, so every page has its own field that repaints identically. */
export function seedFor(key: string, base = 1889) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return base + ((h >>> 0) % 997);
}
type Weighted = readonly (readonly [string, number])[];
function pick(r: () => number, list: Weighted) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [value, weight] of list) { x -= weight; if (x <= 0) return value; }
  return list[0]![0];
}
function stroke(ctx: PaintContext, x: number, y: number, a: number, len: number, w: number, col: string) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
  const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2, bend = len * .18;
  ctx.moveTo(x - dx, y - dy); ctx.quadraticCurveTo(x - dy * bend / len * 2, y + dx * bend / len * 2, x + dx, y + dy); ctx.stroke();
}

export function paintGarden(ctx: PaintContext, W: number, H: number, mode: GardenMode, seed: number, p: GardenPalette = DEFAULT_PALETTE) {
  if (!W || !H) return;
  const r = rng(seed), hero = mode === "hero";
  ctx.lineCap = "round";
  const horizon = hero ? H * .72 : H * .18;
  // Underpaint: Brabant sage sky over the garden's red earth.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (hero) { g.addColorStop(0, "#a9b49c"); g.addColorStop(.7, "#97a38a"); g.addColorStop(.74, "#8a5a3c"); g.addColorStop(1, "#7a3d27"); }
  else { g.addColorStop(0, "#97a38a"); g.addColorStop(.2, "#8a5a3c"); g.addColorStop(1, "#6f3522"); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Brabant sky: swirling strokes along a flow field.
  const sky: Weighted = [["#b9c3a8", 5], ["#8fa08a", 5], [p.d3, 4], ["#a7b6b0", 3], ["#c9ccb2", 3], ["#6f8578", 2], [p.d2, 1.4], ["#e3dcb8", 1.2]];
  const n = Math.round(W * horizon / 34);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * horizon;
    const a = Math.sin(x * .012 + Math.cos(y * .03) * 1.6) * 1.4 + Math.cos(y * .02 + x * .004) * 1.1;
    stroke(ctx, x, y, a, 10 + r() * 16, 3 + r() * 3.2, pick(r, sky));
  }
  // Ochre contours over the clouds.
  const lines = hero ? Math.max(4, Math.round(H / 70)) : 1;
  for (let k = 0; k < lines; k++) {
    const y0 = hero ? (k + .6) * horizon / (lines + .3) : horizon * .55, amp = 6 + r() * 10, f = .012 + r() * .01, ph = r() * 6, x0 = r() * W * .4 - W * .1, x1 = x0 + W * (.4 + r() * .7);
    ctx.strokeStyle = p.d1; ctx.lineWidth = 3.4 + r() * 1.4; ctx.globalAlpha = .95; ctx.beginPath();
    for (let xx = x0; xx < x1; xx += 4) { const yy = y0 + Math.sin(xx * f + ph) * amp + Math.sin(xx * f * 2.7) * amp * .35; if (xx === x0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
    ctx.stroke(); ctx.strokeStyle = "#ecd98a"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // Brabant's low sun (hero only). Not an alert.
  if (hero) {
    const sx = W * .14, sy = horizon * .9;
    ctx.fillStyle = p.d1; ctx.beginPath(); ctx.arc(sx, sy, 18, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = p.d4; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 19, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  }
  // Horizon: the garden's lavender and yellow band.
  ctx.globalAlpha = .9;
  for (let j = 0; j < W / 5; j++) stroke(ctx, r() * W, horizon - 6 + r() * 10, (r() - .5) * .3, 12 + r() * 14, 3 + r() * 2, pick(r, [[p.d1, 3], [p.d2, 3], ["#e8dfa6", 2]]));
  ctx.globalAlpha = 1;
  // Garden earth: slanting dashes.
  const earth: Weighted = [[p.d4, 5], ["#8e3a22", 4], ["#b5653c", 3], ["#6e5a3a", 2], ["#9a7a3e", 1.5], ["#5f6e4a", 1.2], [p.d1, .6]];
  const m = Math.round(W * (H - horizon) / 26);
  for (let e = 0; e < m; e++) stroke(ctx, r() * W, horizon + r() * (H - horizon), -.35 + (r() - .5) * .6, 8 + r() * 12, 3 + r() * 2.5, pick(r, earth));
  // Clichy ticks: a light scatter of broken colour.
  const ticks: Weighted = [["#cdbfdc", 3], [p.d2, 2], [p.d1, 2], ["#6d84a8", 1.5], ["#f4efdc", 2]];
  const count = Math.round(W * H / 2600);
  ctx.globalAlpha = .85;
  for (let t = 0; t < count; t++) stroke(ctx, r() * W, r() * H, -.5 + r() * .4, 5 + r() * 5, 1.8 + r() * 1.2, pick(r, ticks));
  ctx.globalAlpha = 1;
}
