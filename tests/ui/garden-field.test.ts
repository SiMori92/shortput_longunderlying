import { describe, expect, it } from "vitest";
import { paintGarden, seedFor, type PaintContext } from "@/ui/garden-field";

function recorder() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createLinearGradient") return (...a: number[]) => { calls.push(`gradient ${a.join(",")}`); return { addColorStop: (o: number, c: string) => calls.push(`stop ${o} ${c}`) }; };
      return (...a: unknown[]) => { calls.push(`${key} ${a.map(v => typeof v === "number" ? v.toFixed(3) : String(v)).join(",")}`); };
    },
    set(target, key: string, value: unknown) { target[key] = value; calls.push(`${key}=${String(value)}`); return true; },
  });
  return { ctx: ctx as unknown as PaintContext, calls };
}

describe("garden field painter", () => {
  it("paints the same field for the same seed and size", () => {
    const a = recorder(), b = recorder();
    paintGarden(a.ctx, 640, 220, "hero", seedFor("/gate"));
    paintGarden(b.ctx, 640, 220, "hero", seedFor("/gate"));
    expect(a.calls.length).toBeGreaterThan(1000);
    expect(a.calls).toEqual(b.calls);
  });
  it("gives routes different fields", () => {
    const a = recorder(), b = recorder();
    paintGarden(a.ctx, 400, 160, "hero", seedFor("/gate"));
    paintGarden(b.ctx, 400, 160, "hero", seedFor("/puts"));
    expect(a.calls).not.toEqual(b.calls);
  });
  it("never draws text and never schedules animation", () => {
    const { ctx, calls } = recorder();
    paintGarden(ctx, 800, 90, "foot", 1890);
    expect(calls.some(c => /fillText|strokeText|requestAnimationFrame/.test(c))).toBe(false);
  });
  it("does nothing at zero size", () => {
    const { ctx, calls } = recorder();
    paintGarden(ctx, 0, 200, "hero", 1);
    expect(calls).toEqual([]);
  });
});
