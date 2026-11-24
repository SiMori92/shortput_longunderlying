"use client";
import { useState, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonitorResult } from "@/schemas/monitor";
import { Working } from "./working";
import { Empty } from "./dashboard-ui";
import { ChartLegend, ChartTable, ChartTip, DASH, INK_2, LINE, axisProps, endLabel, fmt, gridProps, labelOffsets, series } from "./chart-theme";
const subscribe = () => () => {};
/** Month-day ticks only inside a single year; otherwise year-month so a multi-year axis stays unambiguous. */
const ticks = (dates: readonly { date: string }[]) => { const span = dates.length ? Number(dates.at(-1)!.date.slice(0, 4)) - Number(dates[0]!.date.slice(0, 4)) : 0; return (v: unknown) => span >= 1 ? String(v).slice(0, 7) : String(v).slice(5); };

export function MonitorCharts({ monitor: m, ipoPrice, smaFast, smaSlow }: { monitor: MonitorResult; ipoPrice: number | null; smaFast: number; smaSlow: number }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [width, setWidth] = useState(600), roomy = width >= 560, right = roomy ? 100 : 52;
  const tracking = m.tracking;
  return <><div className="monitor-chart-grid">{[m.symbol, m.reference].map((symbol, i) => {
    const data = m.series[symbol] ?? [], stats = m.stats[i]!, last = data.at(-1), isRef = i === 1;
    const values = data.flatMap(p => [p.close, ...(isRef ? [p.smaFast, p.smaSlow] : [])].filter((v): v is number => v !== null));
    const [dyClose = 0, dyFast = 0, dySlow = 0] = last && values.length ? labelOffsets([last.close, isRef ? last.smaFast : null, isRef ? last.smaSlow : null], [Math.min(...values), Math.max(...values)], 280) : [];
    const lines = [
      { key: "close" as const, name: symbol, color: series(1), dy: dyClose },
      ...(isRef ? [{ key: "smaFast" as const, name: `SMA${smaFast}`, color: series(2), dy: dyFast }, { key: "smaSlow" as const, name: `SMA${smaSlow}`, color: series(3), dy: dySlow }] : []),
    ];
    return <section className="card chart-card" data-ready={ready} key={symbol}>
      <div className="section-heading"><h2>{symbol} price <Working label={`${symbol} price chart`} formula="Stored raw close; peak=max(close through asOf); reference SMAs are arithmetic rolling means" inputs={`As of ${m.asOf}; reference IPO ${ipoPrice ?? "unconfirmed"} is provisional user-brief context`} /></h2><span className="chip">{stats.lastDate ?? "unconfirmed"}</span></div>
      {!data.length ? <Empty>No stored price history</Empty> : <>
        <p className="chart-sub">{data[0]!.date} → {last!.date} · {data.length} stored sessions{isRef ? ` · SMA${smaFast} provisional before ${smaSlow} sessions` : ""}</p>
        <ChartLegend items={[...lines.map(l => ({ label: l.key === "close" ? "Stored close" : l.name, color: l.color })), { label: "Peak", color: INK_2, kind: "dashed" as const }, ...(isRef && ipoPrice !== null ? [{ label: "IPO · provisional", color: INK_2, kind: "dashed" as const }] : [])]} />
        <div className="chart-frame" aria-label={`${symbol} price history`}><ResponsiveContainer width="100%" height="100%" onResize={w => setWidth(w)}><LineChart data={data} accessibilityLayer margin={{ top: 20, right, bottom: 4, left: -16 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} minTickGap={50} tickFormatter={ticks(data)} />
          <YAxis {...axisProps} domain={["auto", "auto"]} />
          <Tooltip isAnimationActive={false} content={<ChartTip format={v => v.toFixed(4)} />} />
          {stats.peak !== null && <ReferenceLine y={stats.peak} stroke={INK_2} strokeDasharray="3 4" label={{ value: "Peak", fill: INK_2, fontSize: 11, position: "insideTopLeft" }} />}
          {isRef && ipoPrice !== null && <ReferenceLine y={ipoPrice} ifOverflow="extendDomain" stroke={INK_2} strokeDasharray={DASH} label={{ value: "IPO · provisional", fill: INK_2, fontSize: 11, position: "insideBottomLeft" }} />}
          {lines.map(l => <Line key={l.key} name={l.name} dataKey={l.key} stroke={l.color} {...LINE} label={endLabel({ count: data.length, name: l.name, format: fmt.price, dy: l.dy, showName: roomy && lines.length > 1 })} />)}
        </LineChart></ResponsiveContainer></div>
        <ChartTable label={`${symbol} price`} rows={data} columns={[{ key: "date", label: "Date" }, { key: "close", label: "Close", format: fmt.price }, ...(isRef ? [{ key: "smaFast" as const, label: `SMA${smaFast}`, format: fmt.price }, { key: "smaSlow" as const, label: `SMA${smaSlow}`, format: fmt.price }] : []), { key: "peak", label: "Peak", format: fmt.price }]} />
      </>}
    </section>;
  })}</div>
    <section className="card chart-card" data-ready={ready}>
      <div className="section-heading"><h2>Daily tracking <Working label="Daily tracking chart" formula="ETF daily return vs configured leverage × reference daily return; common adjacent NYSE sessions only" inputs={`Leverage=${m.leverage}; gaps reset the overlap window; these are price returns, not total returns`} /></h2><span className="chip">{m.symbol} vs {m.leverage}× {m.reference}</span></div>
      {!tracking.length ? <Empty>Tracking needs adjacent overlapping sessions</Empty> : <>
        <p className="chart-sub">{tracking.length} overlapping sessions · price returns</p>
        <ChartLegend items={[{ label: `${m.symbol} daily return`, color: series(1) }, { label: `${m.leverage}× ${m.reference} daily return`, color: series(2), kind: "dashed" }]} />
        <div className="chart-frame short" aria-label="Daily leveraged tracking"><ResponsiveContainer width="100%" height="100%"><LineChart data={tracking} accessibilityLayer margin={{ top: 16, right: 16, bottom: 4, left: -12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} minTickGap={55} tickFormatter={ticks(tracking)} />
          <YAxis {...axisProps} tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`} />
          <Tooltip isAnimationActive={false} content={<ChartTip format={fmt.pct(4)} />} />
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Line name={`${m.symbol} daily return`} dataKey="actual" stroke={series(1)} {...LINE} />
          <Line name={`${m.leverage}× ${m.reference} daily return`} dataKey="leveragedReference" stroke={series(2)} {...LINE} strokeDasharray="4 3" />
        </LineChart></ResponsiveContainer></div>
        <ChartTable label="Daily tracking" rows={tracking} columns={[{ key: "date", label: "Date" }, { key: "actual", label: `${m.symbol} return`, format: fmt.pct(3) }, { key: "leveragedReference", label: `${m.leverage}× ${m.reference}`, format: fmt.pct(3) }, { key: "dailyGap", label: "Daily gap", format: fmt.pp(3) }]} />
      </>}
    </section>
    <section className="card chart-card" data-ready={ready}>
      <div className="section-heading"><h2>Cumulative tracking gap <Working label="Cumulative tracking gap chart" formula="product(1+ETF daily returns) − product(1+L×reference daily returns); percentage-point difference" inputs="Same contiguous overlap and baseline; daily reset compounding, not L × cumulative reference return. Raw closes; distributions unadjusted." /></h2><span className="chip">Price return · contiguous overlap</span></div>
      {!tracking.length ? <Empty>No comparable tracking window</Empty> : <>
        <ChartLegend items={[{ label: "Cumulative price tracking gap", color: series(1) }]} />
        <div className="chart-frame short" aria-label="Cumulative leveraged tracking gap"><ResponsiveContainer width="100%" height="100%"><LineChart data={tracking} accessibilityLayer margin={{ top: 16, right: roomy ? 84 : 60, bottom: 4, left: -12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} minTickGap={55} tickFormatter={ticks(tracking)} />
          <YAxis {...axisProps} tickFormatter={v => `${(Number(v) * 100).toFixed(1)}pp`} />
          <Tooltip isAnimationActive={false} content={<ChartTip format={fmt.pp(4)} />} />
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Line name="Cumulative price tracking gap" dataKey="cumulativeGap" stroke={series(1)} {...LINE} label={endLabel({ count: tracking.length, name: "", format: fmt.pp(2), showName: false })} />
        </LineChart></ResponsiveContainer></div>
        <ChartTable label="Cumulative tracking gap" rows={tracking} columns={[{ key: "date", label: "Date" }, { key: "cumulativeGap", label: "Cumulative gap", format: fmt.pp(3) }]} />
      </>}
    </section></>;
}
