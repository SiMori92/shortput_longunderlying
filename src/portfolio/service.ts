import { createHash, randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, dataRoot, readJson } from "../data/store";
import { JournalSchema, PortfolioEntriesSchema, PortfolioStateSchema, type PortfolioCommand, type PortfolioState } from "../schemas/portfolio";
import { readOptionalRun } from "../runs/service";
import { session, marketDate } from "../market/calendar";
import { matchesSnapshot } from "./basis";
import { recommendation } from "./model";
import { strategyRoot } from "../strategy/paths";
import { DEFAULT_STRATEGY, type StrategySymbol } from "../strategy/symbols";
export class PortfolioConflict extends Error {}
export class PortfolioInputError extends Error {}
export async function readPortfolio(base = dataRoot(), symbol: StrategySymbol = DEFAULT_STRATEGY): Promise<PortfolioState> {
  const root = strategyRoot(base, symbol);
  const [entries, journal] = await Promise.all([readJson(path.join(root, "portfolio/entries.json"), PortfolioEntriesSchema), readJson(path.join(root, "portfolio/journal.json"), JournalSchema)]);
  entries.sort((a,b) => a.date.localeCompare(b.date));
  return PortfolioStateSchema.parse({ revision: createHash("sha256").update(JSON.stringify({ entries, journal })).digest("hex"), entries, journal });
}
/** Fail immediately on contention. Never remove another process's lock. */
export async function savePortfolio(command: PortfolioCommand, base = dataRoot(), now = new Date(), symbol: StrategySymbol = DEFAULT_STRATEGY): Promise<PortfolioState> {
  const root = strategyRoot(base, symbol);
  if (command.operation === "snapshot" && command.entry.openPuts.some(p => p.symbol !== symbol)) throw new PortfolioInputError(`Puts in the ${symbol} portfolio must be ${symbol} puts.`);
  const file = path.join(root, "portfolio/.write.lock");
  let lock;
  try { lock = await open(file, "wx", 0o600); } catch (e) { if (e instanceof Error && "code" in e && e.code === "EEXIST") throw new PortfolioConflict("Portfolio is being saved. Reload and retry; a crashed process lock requires operator review."); throw e; }
  try {
    const state = await readPortfolio(base, symbol);
    if (command.revision !== state.revision) throw new PortfolioConflict("Portfolio changed in another tab. Reload before saving.");
    const date = command.operation === "snapshot" ? command.entry.date : command.date;
    if (date < "2010-01-01" || date > marketDate(now) || !session(date)) throw new PortfolioInputError("Choose an elapsed or current NYSE session date.");
    if (command.operation === "snapshot") {
      const entries = [...state.entries.filter(e => e.date !== date), command.entry].sort((a,b) => a.date.localeCompare(b.date));
      await atomicWrite(path.join(root, "portfolio/entries.json"), PortfolioEntriesSchema, entries);
    } else {
      if (!state.entries.some(e => e.date === date)) throw new PortfolioInputError("Save a snapshot for this date before adding a journal entry.");
      // Freeze the exact stored final recommendation, never accept client-authored advice.
      const run = await readOptionalRun(path.join(root, "runs", `${date}_final.json`));
      const journal = [...state.journal, { id: randomUUID(), date, ...recommendation(run && matchesSnapshot(run, state.entries) ? run : null, date), done: command.done, note: command.note }];
      await atomicWrite(path.join(root, "portfolio/journal.json"), JournalSchema, journal);
    }
    return await readPortfolio(base, symbol);
  } finally { await lock.close(); await unlink(file); }
}
