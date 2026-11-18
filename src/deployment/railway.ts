import path from "node:path";
import { realpath } from "node:fs/promises";
import { z } from "zod";
const RailwayEnvironmentSchema = z.object({
  RAILWAY_ENVIRONMENT_ID: z.string().min(1),
  RAILWAY_VOLUME_MOUNT_PATH: z.string().refine(path.isAbsolute, "An absolute Railway volume mount is required"),
  DATA_DIR: z.string().refine(path.isAbsolute, "An absolute DATA_DIR on the Railway volume is required"),
});
function contained(root: string, file: string) {
  const relative = path.relative(root, file);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}
/** Refuse ephemeral storage on Railway. Volumes mount at runtime, never at build. */
export async function verifyRailwayStorage(env: Record<string, string | undefined> = process.env) {
  if (!env.RAILWAY_ENVIRONMENT_ID) return;
  const parsed = RailwayEnvironmentSchema.safeParse(env);
  if (!parsed.success) throw new Error("Railway requires an attached persistent volume and an absolute DATA_DIR within it. Mount at /app/data and set DATA_DIR=/app/data.");
  const { RAILWAY_VOLUME_MOUNT_PATH: mount, DATA_DIR: dir } = parsed.data;
  if (!contained(path.resolve(mount), path.resolve(dir))) throw new Error("Railway DATA_DIR must be inside the attached persistent volume.");
  // Real paths prevent a symlink from redirecting writes outside the mounted volume.
  // A not-yet-created child directory is allowed; inspect its nearest existing parent.
  const actualMount = await realpath(mount);
  let parent = path.resolve(dir);
  while (true) {
    try {
      const actual = await realpath(parent);
      if (!contained(actualMount, actual)) throw new Error("Railway DATA_DIR resolves outside the persistent volume.");
      return;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const next = path.dirname(parent);
      if (next === parent) throw error;
      parent = next;
    }
  }
}
