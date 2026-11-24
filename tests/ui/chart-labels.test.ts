import { describe, expect, it } from "vitest";
import { labelOffsets } from "@/ui/chart-labels";

describe("end-label offsets", () => {
  it("leaves well-separated labels in place", () => expect(labelOffsets([10, 50, 90], [0, 100], 300)).toEqual([0, 0, 0]));
  it("pushes close labels at least the gap apart, keeping their order", () => {
    const values = [100, 100.5, 101], dy = labelOffsets(values, [0, 200], 300, 15);
    const ys = values.map((v, i) => 300 - v / 200 * 300 + dy[i]!);
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(ys[2]).toBeLessThan(ys[1]!); // higher value stays above
  });
  it("ignores missing values", () => expect(labelOffsets([null, 5], [0, 10], 100)).toEqual([0, 0]));
});
