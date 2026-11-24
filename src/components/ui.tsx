import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";

/** Workbook §6 component kit. Server-safe; no client state. */
export type Tone = "success" | "warning" | "danger" | "active" | "neutral";

/** Status badge: colour always pairs with text. Unknown values are neutral. */
export function Badge({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return <span className={`badge ${tone}${icon ? " has-icon" : ""}`}>{icon}{children}</span>;
}

/** Informational label with no status meaning (a basis, a version, a unit). */
export function Tag({ children }: { children: ReactNode }) { return <span className="chip">{children}</span>; }

/**
 * Alerts sit beside the figures they qualify. "error" announces itself (role=alert); "warning" and "info" are
 * static context unless `live` is set, so page loads do not interrupt screen-reader users.
 */
export function Alert({ tone = "info", children, icon, live = false }: { tone?: "error" | "warning" | "info"; children: ReactNode; icon?: ReactNode; live?: boolean }) {
  const Icon = tone === "error" ? CircleAlert : tone === "warning" ? AlertTriangle : Info;
  return <div className={`alert ${tone}`} role={tone === "error" ? "alert" : live ? "status" : undefined}>{icon ?? <Icon size={18} aria-hidden="true" />}<div className="alert-body">{children}</div></div>;
}

/** Wide tables scroll inside a labelled, keyboard-focusable region; the page itself never scrolls sideways. */
export function TableWrap({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`table-wrap${className ? ` ${className}` : ""}`} role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

/**
 * Metric card. The painted band at its head is positional (ochre, lavender, sage, red earth by grid order),
 * never status. Put the basis or denominator in `sub` so the figure is never shown without it.
 */
export function MetricCard({ label, value, sub, children }: { label: ReactNode; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <section className="card metric"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{sub && <span className="metric-sub">{sub}</span>}{children}</section>;
}
