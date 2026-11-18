import { expect, it, vi } from "vitest";
const { schedule } = vi.hoisted(() => ({ schedule: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock("node-cron", () => ({ default: { schedule } }));
import { registerScheduler } from "../../src/jobs/scheduler";
it("registers exactly three ET schedules once per process without emitting run files", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  registerScheduler(); registerScheduler();
  expect(schedule).toHaveBeenCalledTimes(3);
  expect(schedule.mock.calls.map(call => (call as unknown[])[0])).toEqual(["40 15 * * 1-5", "20 16 * * 1-5", "0 7 * * 1-5"]);
  for (const call of schedule.mock.calls) expect((call as unknown[])[2]).toMatchObject({ timezone: "America/New_York", noOverlap: true });
  log.mockRestore();
});
