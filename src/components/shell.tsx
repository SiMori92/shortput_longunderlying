"use client";
import { Logout } from "./logout";
import { RunNow } from "./run-now";
import { StrategySwitcher } from "./strategy-switcher";
import type { StrategySymbol } from "@/strategy/symbols";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowDownToLine, ChartNoAxesCombined, ChevronLeft, ClipboardList, FlaskConical, LayoutDashboard, Leaf, ListChecks, Menu, ShieldCheck, Wallet } from "lucide-react";
const links = [{ path: "/", label: "Today", icon: LayoutDashboard }, { path: "/gate", label: "Gate", icon: Activity }, { path: "/puts", label: "Puts", icon: ArrowDownToLine }, { path: "/portfolio", label: "Portfolio", icon: Wallet }, { path: "/monitor", label: "Monitor", icon: FlaskConical }, { path: "/backtest", label: "Backtest", icon: ChartNoAxesCombined }, { path: "/rules", label: "Rules", icon: ListChecks }];
export function Shell({ children, asOf, runType, freshness, symbol }: { children: React.ReactNode; asOf: string; runType: string; freshness: string; symbol: StrategySymbol }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  function nav(mobile = false) { return links.map(({ path, label, icon: Icon }) => <Link key={path} href={path} className={pathname === path ? "nav-link active" : "nav-link"} aria-current={pathname === path ? "page" : undefined} title={label} aria-label={label}><Icon size={mobile ? 18 : 20} aria-hidden="true" /><span>{label}</span></Link>); }
  return <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar"><Link className="brand" href="/" aria-label="Strategy Monitor home"><span className="brand-mark"><Leaf size={24} /></span><span className="brand-name">STRATEGY<span>MONITOR</span></span></Link><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}</button><div className="nav-caption">WORKSPACE</div><nav aria-label="Main navigation">{nav()}</nav><div className="sidebar-foot"><ShieldCheck size={18} /><span>Private workspace<br /><small>V3.1 · Strategy monitor</small></span></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><ClipboardList size={18} /><span>Strategy workspace</span><span className="slash">/</span><strong>{links.find(l => l.path === pathname)?.label ?? "Today"}</strong></div><div className="header-status"><StrategySwitcher symbol={symbol} /><span className={`freshness ${freshness}`}><i />{asOf}</span><span className="chip">{runType} · {freshness}</span><RunNow symbol={symbol} /><Logout /></div></header><main id="main">{children}</main><footer className="page-footer"><span><ShieldCheck size={14} /> Local workspace · model prices</span><span>{symbol} core + weekly puts</span></footer></div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{nav(true)}</nav>
  </div>;
}
