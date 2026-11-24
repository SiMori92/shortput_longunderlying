"use client";
import type { ReactNode } from "react";
import { TableWrap } from "./ui";
export { labelOffsets } from "@/ui/chart-labels";

/**
 * Chart conventions from UI_DESIGN_WORKBOOK.html §3 "Chart colours": series colours in fixed order (never cycled,
 * the colour follows the entity), 2px lines, a recessive grid, one axis, ink text, direct labels at the line ends
 * plus a legend, keyboard-readable values, and a table view. Ochre (slot 3) and olive (7) are under 3:1 on chalk,
 * so any chart using them must keep its direct labels.
 */
export const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `var(--series-${n})`) as readonly string[];
export const series = (slot: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => SERIES[slot - 1]!;
export const INK = "var(--chart-ink)", INK_2 = "var(--chart-ink-2)", GRID = "var(--chart-grid)", AXIS = "var(--chart-axis)";
/** Reserved chart status colours: good/bad marks only, always shown with an icon and a label, never as a series. */
export const STATUS = { good: "var(--status-good)", warning: "var(--status-warning)", serious: "var(--status-serious)", critical: "var(--status-critical)" } as const;
export const axisProps = { stroke: AXIS, tick: { fill: INK_2, fontSize: 11 }, tickLine: false, axisLine: false } as const;
export const gridProps = { stroke: GRID, vertical: false } as const;
export const LINE = { strokeWidth: 2, dot: false, isAnimationActive: false, strokeLinejoin: "round", strokeLinecap: "round" } as const;
export const DASH = "6 4";

type TipEntry = { name?: unknown; value?: unknown; color?: string; stroke?: string; dataKey?: unknown };
/** Crosshair tooltip: every series value at the active point, values in ink, colour as a mark beside it. */
export function ChartTip({ active, payload, label, format, title }: { active?: boolean; payload?: readonly TipEntry[]; label?: unknown; format: (value: number, name: string) => string; title?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tip"><div className="t">{title ? title(String(label)) : String(label)}</div>{payload.filter(p => p.value !== null && p.value !== undefined).map(p => <div className="r" key={String(p.dataKey ?? p.name)}><span><i style={{ background: p.stroke ?? p.color }} />{String(p.name)}</span><b>{typeof p.value === "number" ? format(p.value, String(p.name)) : String(p.value)}</b></div>)}</div>;
}

type LabelArgs = { x?: number | string; y?: number | string; index?: number; value?: unknown };
/** Direct label at the last point of a line: the value in bold ink, then the series name when there is room. */
export function endLabel({ count, name, format, dy = 0, showName = true }: { count: number; name: string; format: (v: number) => string; dy?: number; showName?: boolean }) {
  function EndLabel(props: LabelArgs) {
    if (props.index !== count - 1 || typeof props.value !== "number") return <g />;
    const x = Number(props.x) + 8, y = Number(props.y) + 4 + dy;
    return <text x={x} y={y} fill={INK} fontSize={12}><tspan fontWeight={600}>{format(props.value)}</tspan>{showName ? ` ${name}` : ""}</text>;
  }
  return EndLabel;
}

/** Legend in ink; the colour sits beside the text as a line, dashed line, or band swatch. */
export function ChartLegend({ items }: { items: { label: ReactNode; color: string; kind?: "line" | "dashed" | "band"; icon?: ReactNode }[] }) {
  return <div className="chart-legend">{items.map((item, i) => <span key={i}>{item.icon ?? <i className={item.kind === "dashed" ? "dashed" : item.kind === "band" ? "band" : undefined} style={{ color: item.color, background: item.kind === "band" ? item.color : undefined }} aria-hidden="true" />}{item.label}</span>)}</div>;
}

/** Table view of a chart (workbook "Show as table"): the latest rows, newest first, with the total stated. */
export function ChartTable<Row extends Record<string, unknown>>({ label, rows, columns, limit = 20 }: { label: string; rows: readonly Row[]; columns: readonly { key: keyof Row & string; label: string; format?: (value: number) => string }[]; limit?: number }) {
  const shown = rows.slice(-limit).toReversed();
  return <details className="chart-table"><summary className="disclosure-title">Show as table · latest {shown.length} of {rows.length}</summary>
    <TableWrap label={`${label} as a table`}><table className="inventory"><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>{shown.map((row, i) => <tr key={i}>{columns.map(c => { const v = row[c.key]; return <td key={c.key}>{typeof v === "number" ? c.format ? c.format(v) : String(v) : v == null ? <span className="unavailable" aria-label="Not available">—</span> : String(v)}</td>; })}</tr>)}</tbody></table></TableWrap>
  </details>;
}

export const fmt = {
  price: (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
  money: (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
  millions: (v: number) => `$${(v / 1e6).toFixed(2)}m`,
  ratio: (v: number) => v.toFixed(3),
  pct: (digits = 2) => (v: number) => `${(v * 100).toFixed(digits)}%`,
  pp: (digits = 2) => (v: number) => `${(v * 100).toFixed(digits)} pp`,
};
