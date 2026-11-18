import { readdir, rm } from "node:fs/promises";
import path from "node:path";
// Next's instrumentation trace can include the runtime data tree, and standalone
// copies loaded .env files separately from tracing. A deployable build must have neither.
const root = path.resolve(".next/standalone");
const privateNames = new Set(["data", ".e2e-data", ".auth-setup", "reports", "tests"]);
for (const entry of await readdir(root)) {
  if (privateNames.has(entry) || entry.startsWith(".env")) await rm(path.join(root, entry), { recursive: true, force: true });
}
const remaining = await readdir(root);
if (remaining.some(name => privateNames.has(name) || name.startsWith(".env"))) throw new Error("Private files remain in standalone package");
console.info("[package] Standalone excludes runtime data, enrollment files, tests, reports and environment files");
