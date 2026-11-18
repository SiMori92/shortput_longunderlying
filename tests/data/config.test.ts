import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
import { RulesSchema, UnderlyingsSchema } from "../../src/schemas/config";
import { PortfolioEntrySchema } from "../../src/schemas/portfolio";
import { RunInputSchema, RunResultSchema } from "../../src/schemas/run";
it("keeps live V3.1 and archived V3 separate, with unknown SPAX facts", async () => {
  const live = await readJson("config/rules/v3_1.json", RulesSchema);
  const archived = await readJson("config/rules/archive/v3.json", RulesSchema);
  expect(live).toMatchObject({ id: "v3_1", gateMode: "risk-cut", riskCutMultiplier: 0.5, archived: false });
  expect(archived).toMatchObject({ id: "v3_archived", gateMode: "all-conditions", archived: true });
  const under = await readJson("config/underlyings.json", UnderlyingsSchema);
  expect(Object.values(under.find(u => u.symbol === "SPAX")!.facts!)).toEqual(Array(7).fill("unconfirmed"));
});
it("bundled CSVs match their recorded source hashes", async () => {
  const manifest = await readJson("seed/manifest.json", z.object({ files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }));
  for (const [file, hash] of Object.entries(manifest.files)) expect(createHash("sha256").update(await readFile(`seed/bars/${file}`)).digest("hex")).toBe(hash);
});
it("rejects extra API input fields and fractional portfolio contracts", () => {
  expect(RunInputSchema.safeParse({ type: "final", bypass: true }).success).toBe(false);
  expect(RunResultSchema.safeParse({ type: "final" }).success).toBe(false);
  expect(PortfolioEntrySchema.safeParse({ date: "2026-11-16", accountValue: 100000, shares: 0, openPuts: [{ id: "p", symbol: "SOXL", opened: "2026-11-16", expiry: "2026-11-27", strike: 40, contracts: 1.2, credit: 2 }] }).success).toBe(false);
});
