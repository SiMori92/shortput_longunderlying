"use client";
import { useState, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonPoint } from "@/backtest/model";
import { Working } from "./working";
import { ChartLegend, ChartTable, ChartTip, DASH, LINE, axisProps, endLabel, fmt, gridProps, labelOffsets, series } from "./chart-theme";
const subscribe = () => () => {};

export function BacktestCharts({ points, capital, symbol = "SOXL" }: { points: ComparisonPoint[]; capital: number; symbol?: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [log, setLog] = useState(true), [width, setWidth] = useState(800), roomy = width >= 560;
  const positive = points.flatMap(p => [p.live, p.archived, ...(p.benchmark !== null ? [p.benchmark] : [])]), lo = Math.min(...positive) * .9, hi = Math.max(...positive) * 1.1;
  const last = points.at(-1);
  return <>{[false, true].map(dd => {
    const keys = dd ? (["liveDD", "archivedDD", "benchmarkDD"] as const) : (["live", "archived", "benchmark"] as const);
    const names = ["V3.1 model", "Archived V3 model", `${symbol} buy & hold`];
    const format = dd ? fmt.pct(1) : fmt.millions;
    const lastValues = last ? keys.map(k => last[k]) : [];
    const ddValues = points.flatMap(p => [p.liveDD, p.archivedDD, p.benchmarkDD].filter((v): v is number => v !== null));
    const offsets = last ? labelOffsets(lastValues, dd ? [Math.min(...ddValues), 0] : [lo, hi], 290, 15, !dd && log) : [];
    return <section key={String(dd)} className="card chart-card" data-ready={ready}>
      <div className="section-heading"><h2>{dd ? "Underwater" : "Model equity"}<Working label={dd ? "Backtest drawdown chart" : "Backtest equity chart"} formula={dd ? "Equity / running peak equity − 1, separately for each series" : `V3.1 and V3: shared fractional engine; ${symbol} = capital × raw close / first observed raw close`} inputs={`Capital=${capital}; ${points[0]?.date} through ${last?.date}; ${symbol} excludes fees/distributions; manual KILL overlay excluded`} /></h2>{dd ? <span className="chip">Daily drawdown</span> : <div className="chart-controls" role="group" aria-label="Equity scale"><button type="button" className="button" aria-pressed={!log} onClick={() => setLog(false)}>Linear</button><button type="button" className="button" aria-pressed={log} onClick={() => setLog(true)}>Log</button></div>}</div>
      <p className="chart-sub">{points[0]?.date} → {last?.date} · {points.length} sessions · start capital {fmt.money(capital)}{!dd && log ? " · log scale" : ""}</p>
      <ChartLegend items={[{ label: names[0], color: series(1) }, { label: names[1], color: series(2), kind: "dashed" }, { label: names[2], color: series(3) }]} />
      <div className="chart-frame" aria-label={dd ? "Backtest underwater history" : "Backtest model equity history"}><ResponsiveContainer width="100%" height="100%" onResize={w => setWidth(w)}><LineChart data={points} accessibilityLayer margin={{ top: 18, right: roomy ? 150 : 60, bottom: 4, left: -8 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={65} tickFormatter={v => String(v).slice(0, 7)} />
        <YAxis {...axisProps} scale={!dd && log ? "log" : "auto"} domain={dd ? ["auto", "auto"] : log ? [lo, hi] : [0, "auto"]} width={65} tickFormatter={v => dd ? `${(Number(v) * 100).toFixed(0)}%` : `$${(Number(v) / 1e6).toFixed(1)}m`} />
        <Tooltip isAnimationActive={false} content={<ChartTip format={dd ? fmt.pct(2) : fmt.money} />} />
        {dd && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
        {keys.map((k, i) => <Line key={k} name={names[i]} dataKey={k} stroke={series((i + 1) as 1 | 2 | 3)} {...LINE} strokeWidth={i === 2 ? 1.5 : 2} strokeDasharray={i === 1 ? DASH : undefined} label={endLabel({ count: points.length, name: ["V3.1", "V3", symbol][i]!, format, dy: offsets[i] ?? 0, showName: roomy })} />)}
      </LineChart></ResponsiveContainer></div>
      <ChartTable label={dd ? "Underwater" : "Model equity"} rows={points} columns={[{ key: "date", label: "Date" }, ...keys.map((k, i) => ({ key: k, label: names[i]!, format: dd ? fmt.pct(2) : fmt.money }))]} />
    </section>;
  })}</>;
}
