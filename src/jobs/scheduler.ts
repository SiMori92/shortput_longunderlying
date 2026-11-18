import cron, { type ScheduledTask } from "node-cron";
export const SCHEDULES = [
  { type: "preview", expression: "40 15 * * 1-5" },
  { type: "final", expression: "20 16 * * 1-5" },
  { type: "catchup", expression: "0 7 * * 1-5" },
] as const;
type Runtime = typeof globalThis & { strategyMonitorTasks?: ScheduledTask[]; strategyMonitorStartup?: Promise<void> };
const runtime = globalThis as Runtime;
export function registerScheduler() {
  if (runtime.strategyMonitorTasks) return;
  runtime.strategyMonitorTasks = SCHEDULES.map(s => cron.schedule(s.expression, async () => {
    try {
      const { runScheduled } = await import("../runs/service");
      console.info(`[scheduler] ${s.type}`, await runScheduled(s.type));
    } catch (error) { console.error(`[scheduler] ${s.type} failed; previous final retained`, error); }
  }, { timezone: "America/New_York", noOverlap: true, name: `strategy-${s.type}` }));
  console.info("[scheduler] Registered preview 15:40, final 16:20, catch-up 07:00 America/New_York (calendar gated)");
}
export async function initializeRuntime() {
  runtime.strategyMonitorStartup ??= (async () => {
    const { verifyRailwayStorage } = await import("../deployment/railway");
    await verifyRailwayStorage();
    const { seedData } = await import("../data/seed");
    const counts = await seedData();
    console.info("[seed] Ready", counts);
    registerScheduler();
  })().catch(error => { runtime.strategyMonitorStartup = undefined; throw error; });
  return runtime.strategyMonitorStartup;
}
