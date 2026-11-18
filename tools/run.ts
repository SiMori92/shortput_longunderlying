import { seedData } from "../src/data/seed";
import { createRun } from "../src/runs/service";
import { RunInputSchema } from "../src/schemas/run";
// Usage: pnpm run:now [type] [date] [SOXL|SPAX]
const input = RunInputSchema.parse({ type: process.argv[2] ?? "final", ...(process.argv[3] ? { date: process.argv[3] } : {}), ...(process.argv[4] ? { symbol: process.argv[4] } : {}) });
await seedData();
const run = await createRun(input);
console.info(JSON.stringify({ symbol: run.symbol, id: run.id, asOf: run.asOf, freshness: run.freshness, gate: run.gate?.state, account: run.account ? "entered" : "unconfirmed" }, null, 2));
