"use client";
import { Logout } from "./logout";
import { RunNow } from "./run-now";
import { StrategySwitcher } from "./strategy-switcher";
import { GardenField } from "./garden-field";
import { SunMark } from "./sun-mark";
import type { StrategySymbol } from "@/strategy/symbols";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowDownToLine, ChartNoAxesCombined, ChevronLeft, FlaskConical, LayoutDashboard, ListChecks, Menu, ShieldCheck, Wallet } from "lucide-react";
const links = [{ path: "/", label: "Today", icon: LayoutDashboard }, { path: "/gate", label: "Gate", icon: Activity }, { path: "/puts", label: "Puts", icon: ArrowDownToLine }, { path: "/portfolio", label: "Portfolio", icon: Wallet }, { path: "/monitor", label: "Monitor", icon: FlaskConical }, { path: "/backtest", label: "Backtest", icon: ChartNoAxesCombined }, { path: "/rules", label: "Rules", icon: ListChecks }];
const freshnessLabel: Record<string, string> = { valid: "Validated", provisional: "Provisional", blocked: "Blocked", unconfirmed: "Unconfirmed" };
export function Shell({ children, asOf, runType, freshness, symbol }: { children: React.ReactNode; asOf: string; runType: string; freshness: string; symbol: StrategySymbol }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const current = links.find(l => l.path === pathname)?.label ?? "Today";
  function nav() { return links.map(({ path, label, icon: Icon }) => <Link key={path} href={path} className={pathname === path ? "nav-link active" : "nav-link"} aria-current={pathname === path ? "page" : undefined} title={label} aria-label={label}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>); }
  return <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Strategy Monitor home"><SunMark /><span className="brand-name">Strategy <em>Monitor</em></span></Link>
      <button type="button" className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>{collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}</button>
      <div className="nav-caption">Workspace</div>
      <nav aria-label="Main navigation">{nav()}</nav>
      <div className="sidebar-foot"><ShieldCheck size={18} aria-hidden="true" /><span>Private workspace<br /><small>V3.1 · Strategy monitor</small></span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>Strategy workspace</span><span className="slash" aria-hidden="true">/</span><strong>{current}</strong></div>
        <div className="header-status"><StrategySwitcher symbol={symbol} /><span className={`freshness ${freshness}`} title={`Latest data ${asOf} · ${freshnessLabel[freshness] ?? freshness}`}><i aria-hidden="true" />{asOf}</span><span className={`badge ${freshness === "valid" ? "success" : freshness === "provisional" ? "active" : freshness === "blocked" ? "warning" : "neutral"}`}>{runType} · {freshness}</span><RunNow symbol={symbol} /><Logout /></div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="page-footer"><div className="page-footer-text"><span><ShieldCheck size={14} aria-hidden="true" /> Local workspace · model prices</span><span>{symbol} core + weekly puts</span></div><GardenField mode="foot" seed={1890} /></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{nav()}</nav>
  </div>;
}
