import { expectedClose } from "@/market/calendar";
import { readOptionalRun } from "@/runs/service";
import { Shell } from "@/components/shell";
import { readJson, dataRoot, isMissing } from "@/data/store";
import { BarsSchema } from "@/schemas/bars";
import path from "node:path";
import { requirePageSession } from "@/auth/page";
import { selectedStrategy } from "@/strategy/server";
import { strategyRoot } from "@/strategy/paths";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageSession();
  const symbol = await selectedStrategy();
  const bars = await readJson(path.join(dataRoot(), `bars/${symbol}.json`), BarsSchema).catch(e => { if (isMissing(e)) return null; throw e; });
  const run = await readOptionalRun(path.join(strategyRoot(dataRoot(), symbol), "runs/last-attempt.json"));
  return <Shell symbol={symbol} asOf={run?.asOf ?? bars?.bars.at(-1)?.date ?? "Unconfirmed"} runType={run?.type ?? "Seed"} freshness={run && run.asOf < expectedClose(new Date()) ? "blocked" : run?.freshness.status ?? "unconfirmed"}>{children}</Shell>;
}
