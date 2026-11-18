import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
export function dataRoot() { return path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), "data")); }
export async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T> { return schema.parse(JSON.parse(await readFile(file, "utf8"))); }
export function isMissing(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
export async function atomicWrite<T>(file: string, schema: z.ZodType<T>, input: unknown): Promise<T> {
  const value = schema.parse(input);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value), { encoding: "utf8", mode: 0o600, flag: "wx" }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
  return value;
}
