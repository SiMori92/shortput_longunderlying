import { CheckCircle2, ShieldHalf, PowerOff, OctagonX, CircleHelp, Calculator, AlertTriangle } from "lucide-react";
import { Working } from "./working";
import type { RunResult } from "@/schemas/run";
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
export const decimal = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
export function Num({ value, label, formula, inputs, format = "number" }: { value: number | null | undefined; label: string; formula: string; inputs?: string; format?: "money" | "percent" | "number" | "points" }) {
  return <span className="number-working">{value == null ? "Unconfirmed" : <><span>{format === "money" ? money(value) : format === "percent" ? pct(value) : format === "points" ? `${(value * 100).toFixed(2)} pp` : decimal(value)}</span><Working label={label} formula={formula} inputs={inputs ?? `Result = ${value}`} /></>}</span>;
}
export function RunNum({ run, field, value, label, format }: { run: RunResult | null; field: string; value: number | null | undefined; label: string; format?: "money" | "percent" | "number" | "points" }) {
  const w = run?.working[field];
  return <Num value={value} label={label} format={format} formula={w?.formula ?? field} inputs={w ? JSON.stringify(w.inputs) + `; result = ${w.result}` : undefined} />;
}
export function StateBadge({ state }: { state: string }) {
  const Icon = state === "ON" ? CheckCircle2 : state === "RISK CUT" ? ShieldHalf : state === "OFF" ? PowerOff : state === "KILL" ? OctagonX : CircleHelp;
  return <span className={`state-badge state-${state.toLowerCase().replaceAll(" ", "-")}`}><Icon size={20} />{state}</span>;
}
export function ContextNotice({ date }: { date: string }) { return <div className="notice context-notice"><AlertTriangle size={18} /><span>Stored-history model · through {date} · market validation unconfirmed · no account actions</span></div>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="empty-state"><Calculator size={24} /><span>{children}</span></div>; }
export function Meter({ value, label }: { value: number; label: string }) { return <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, value * 100))}><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>; }
