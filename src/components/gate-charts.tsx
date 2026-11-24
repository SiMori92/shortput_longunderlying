"use client";
import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, PowerOff, ShieldHalf } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea } from "recharts";
import type { GatePoint } from "@/dashboard/model";
import { Working } from "./working";
import { AXIS, ChartLegend, ChartTable, ChartTip, DASH, INK_2, LINE, STATUS, axisProps, endLabel, fmt, gridProps, labelOffsets, series } from "./chart-theme";

// Gate state bands are chart status marks (good / warning / neutral), shown with an icon and a label in the legend.
const bandColor: Record<string, string> = { ON: STATUS.good, "RISK CUT": STATUS.warning, OFF: AXIS };
const bandIcon = { ON: CheckCircle2, "RISK CUT": ShieldHalf, OFF: PowerOff } as const;
const subscribe = () => () => {};

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return null;
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  return <svg className="sparkline" viewBox="0 0 280 48" role="img" aria-label={`${label}; last ${values.length} stored sessions`} preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={values.map((v, i) => `${i / Math.max(1, values.length - 1) * 280},${44 - (v - min) / range * 38}`).join(" ")} /></svg>;
}

export function GateCharts({ points, threshold, reference = "SOXX" }: { points: GatePoint[]; threshold: number; reference?: string }) {
  const [years, setYears] = useState(1), [width, setWidth] = useState(800);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const end = points.at(-1)?.date ?? "", start = `${Number(end.slice(0, 4)) - years}${end.slice(4)}`;
  const data = points.filter(p => p.date >= start);
  const bands: { start: string; end: string; state: string }[] = [];
  data.forEach((p, i) => { const last = bands.at(-1); if (last?.state === p.state) last.end = p.date; else { if (last) last.end = p.date; bands.push({ start: p.date, end: data[i + 1]?.date ?? p.date, state: p.state }); } });
  const roomy = width >= 560, right = roomy ? 104 : 52;
  const last = data.at(-1), values = data.flatMap(p => [p.price, p.fast, p.slow].filter((v): v is number => v !== null));
  const [dyPrice = 0, dyFast = 0, dySlow = 0] = last && values.length ? labelOffsets([last.price, last.fast, last.slow], [Math.min(...values), Math.max(...values)], 280) : [];
  const trend = [
    { key: "price" as const, name: reference, color: series(1), dy: dyPrice },
    { key: "fast" as const, name: "SMA50", color: series(2), dy: dyFast },
    { key: "slow" as const, name: "SMA200", color: series(3), dy: dySlow },
  ];
  const tip = (format: (v: number) => string) => <ChartTip format={format} />;
  return <><section className="card chart-card" data-ready={hydrated}>
    <div className="section-heading"><h2>{reference} trend <Working label={`${reference} trend chart`} formula={`${reference} close; rolling arithmetic means after feature warm-up`} inputs="Price and SMA are stored-history model context; hover, tap or focus the chart and use arrow keys for exact values" /></h2><div className="segmented" role="group" aria-label="Chart period">{[1, 5].map(y => <button type="button" key={y} disabled={!hydrated} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}</div></div>
    <p className="chart-sub">{data[0]?.date ?? "—"} → {end || "—"} · {data.length} stored sessions · ends at the earliest last date across the required input files · shading shows the V3.1 gate state</p>
    <ChartLegend items={[...trend.map(t => ({ label: t.name, color: t.color })), ...(["ON", "RISK CUT", "OFF"] as const).map(state => { const Icon = bandIcon[state]; return { label: state, color: bandColor[state]!, icon: <Icon size={14} color={bandColor[state]} aria-hidden="true" /> }; })]} />
    <div className="chart-frame" aria-label={`${reference} price and moving averages`}><ResponsiveContainer width="100%" height="100%" onResize={w => setWidth(w)}><LineChart data={data} margin={{ top: 12, right, bottom: 4, left: -16 }} accessibilityLayer>
      <CartesianGrid {...gridProps} />
      <XAxis dataKey="date" {...axisProps} minTickGap={55} tickFormatter={v => String(v).slice(2, 7)} />
      <YAxis {...axisProps} domain={["auto", "auto"]} />
      <Tooltip isAnimationActive={false} content={tip(fmt.price)} />
      {bands.map(b => <ReferenceArea key={b.start} x1={b.start} x2={b.end} fill={bandColor[b.state]} fillOpacity={b.state === "OFF" ? .16 : .1} strokeOpacity={0} />)}
      {trend.map(t => <Line key={t.key} name={t.name} dataKey={t.key} stroke={t.color} {...LINE} label={endLabel({ count: data.length, name: t.name, format: fmt.price, dy: t.dy, showName: roomy })} />)}
    </LineChart></ResponsiveContainer></div>
    <ChartTable label={`${reference} trend`} rows={data} columns={[{ key: "date", label: "Date" }, { key: "price", label: reference, format: fmt.price }, { key: "fast", label: "SMA50", format: fmt.price }, { key: "slow", label: "SMA200", format: fmt.price }, { key: "state", label: "Gate" }]} />
  </section>
    <section className="card chart-card" data-ready={hydrated}>
      <div className="section-heading"><h2>Volatility brake <Working label="Volatility ratio chart" formula="RV10 / RV60; RVn = sample std(log returns, n) × √252" inputs={`Fail above ${threshold}; equality passes`} /></h2><span className="chip">RV10 / RV60</span></div>
      <p className="chart-sub">Brake fails above {threshold}; equality passes</p>
      <ChartLegend items={[{ label: "RV10 / RV60", color: series(1) }, { label: `Brake ${threshold}`, color: INK_2, kind: "dashed" }]} />
      <div className="chart-frame short" aria-label="Realized volatility ratio"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right, bottom: 4, left: -16 }} accessibilityLayer>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={55} tickFormatter={v => String(v).slice(2, 7)} />
        <YAxis {...axisProps} domain={[0, "auto"]} />
        <Tooltip isAnimationActive={false} content={tip(fmt.ratio)} />
        <ReferenceLine y={threshold} stroke={INK_2} strokeDasharray={DASH} label={{ value: `Brake ${threshold}`, fill: INK_2, fontSize: 11, position: "insideTopLeft" }} />
        <Line name="RV10 / RV60" dataKey="ratio" stroke={series(1)} {...LINE} label={endLabel({ count: data.length, name: "", format: fmt.ratio, showName: false })} />
      </LineChart></ResponsiveContainer></div>
      <ChartTable label="Volatility brake" rows={data} columns={[{ key: "date", label: "Date" }, { key: "ratio", label: "RV10 / RV60", format: fmt.ratio }, { key: "state", label: "Gate" }]} />
    </section></>;
}
