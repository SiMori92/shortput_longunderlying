import { requirePageSession } from "@/auth/page";
import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
const sections: Record<string, { title: string; milestone: string }> = { gate: { title: "Gate", milestone: "M4" }, puts: { title: "Puts", milestone: "M4" }, portfolio: { title: "Portfolio", milestone: "M5" }, spax: { title: "SPAX", milestone: "M6" }, backtest: { title: "Backtest", milestone: "M7" }, rules: { title: "Rules", milestone: "M7" } };
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  await requirePageSession();
  const { section } = await params;
  const info = sections[section];
  if (!info) notFound();
  return <div className="page-stack"><div className="page-title"><div><div className="eyebrow">STRATEGY WORKSPACE</div><h1>{info.title}</h1></div></div><div className="card placeholder"><LockKeyhole size={32} /><h2>Awaiting {info.milestone}</h2><p className="muted">No validated analysis available.</p>{section === "spax" && <span className="chip warning">NOT READY · facts unconfirmed</span>}</div></div>;
}
