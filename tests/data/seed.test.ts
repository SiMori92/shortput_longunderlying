import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSeedCsv, seedData } from "../../src/data/seed";
import { atomicWrite, readJson } from "../../src/data/store";
import { BarsSchema } from "../../src/schemas/bars";
const dirs: string[] = [];
async function temp() { const d = await mkdtemp(path.join(tmpdir(), "strategy-m1-")); dirs.push(d); return d; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const header = ",open,high,low,close,volume,adjclose\n";
describe("seed boundaries", () => {
  it("preserves close independently of adjclose, including a quoted date", () => {
    const b = parseSeedCsv(header + '"2026-11-16",10,12,9,11,100,8\n', "SOXL");
    expect(b.bars[0]).toMatchObject({ date: "2026-11-16", close: 11, adjclose: 8 });
  });
  it.each(["2026-11-16,10,12,9,,100,8", "2026-11-16,10,8,9,11,100,8", "2026-02-30,10,12,9,11,100,8"])("rejects malformed CSV: %s", row => { expect(() => parseSeedCsv(header + row + "\n", "SOXL")).toThrow(); });
  it("rejects duplicate and descending dates", () => {
    for (const dates of [["2026-11-16", "2026-11-16"], ["2026-11-16", "2026-11-13"]]) expect(() => parseSeedCsv(header + dates.map(d => `${d},10,12,9,11,100,8`).join("\n"), "SOXL")).toThrow();
  });
  it("imports all six source files and does not invent SPAX or portfolio data", async () => {
    const d = await temp(); const counts = await seedData(d);
    expect(Object.keys(counts).sort()).toEqual(["SOXL", "SOXX", "SPCX", "SPY", "^IRX", "^VIX"].sort());
    const b = await readJson(path.join(d, "bars/SOXL.json"), BarsSchema);
    expect(b.bars.at(-1)).toMatchObject({ date: "2026-11-16", close: 48.7599983215332 });
    expect(b.bars[0]?.date).toBe("2010-03-11");
    expect(await readdir(path.join(d, "bars"))).not.toContain("SPAX.json");
    expect(JSON.parse(await readFile(path.join(d, "portfolio/entries.json"), "utf8"))).toEqual([]);
  });
  it("restart preserves valid existing bars; corruption fails closed", async () => {
    const d = await temp(); await seedData(d);
    const file = path.join(d, "bars/SOXL.json");
    const b = await readJson(file, BarsSchema); b.bars[0]!.adjclose = null;
    await atomicWrite(file, BarsSchema, b); await seedData(d);
    expect((await readJson(file, BarsSchema)).bars[0]!.adjclose).toBeNull();
    await writeFile(file, '{"bad":true}');
    await expect(seedData(d)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe('{"bad":true}');
  });
  it("rejects invalid writes before replacing a good file and cleans temporary files", async () => {
    const d = await temp(); const file = path.join(d, "SOXL.json");
    const b = parseSeedCsv(header + "2026-11-16,10,12,9,11,100,8\n", "SOXL");
    await atomicWrite(file, BarsSchema, b);
    await expect(atomicWrite(file, BarsSchema, { ...b, symbol: "../secret" })).rejects.toThrow();
    expect(await readJson(file, BarsSchema)).toEqual(b);
    expect(await readdir(d)).toEqual(["SOXL.json"]);
  });
});
