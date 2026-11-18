import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "../../src/data/store";
it("bundled raw seed files are byte-identical to the Python fixture inputs", async () => {
  const hashes = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/));
  const provenance = await readJson("tests/fixtures/provenance.json", z.strictObject({
    python: z.string(), pandas: z.string(), numpy: z.string(), scipy: z.string(), sources: hashes, bars: hashes,
  }));
  for (const symbol of ["SOXL", "SOXX", "SPY", "^VIX", "^IRX", "SPCX"]) {
    expect(createHash("sha256").update(await readFile(`seed/bars/${symbol}.csv`)).digest("hex")).toBe(provenance.bars[`${symbol}.csv`]);
  }
});
