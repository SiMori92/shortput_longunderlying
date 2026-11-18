import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { verifyRailwayStorage } from "../../src/deployment/railway";
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "strategy-volume-")); await mkdir(path.join(root,"volume")); });
afterEach(async () => { await rm(root,{recursive:true,force:true}); });
function env(dir = path.join(root,"volume")): Record<string,string|undefined> { return { RAILWAY_ENVIRONMENT_ID: "test-environment", RAILWAY_VOLUME_MOUNT_PATH: path.join(root,"volume"), DATA_DIR: dir }; }
describe("Railway persistent storage", () => {
  it("leaves non-Railway operation unchanged", async () => { await expect(verifyRailwayStorage({})).resolves.toBeUndefined(); });
  it("accepts the mounted directory and new child paths", async () => {
    await expect(verifyRailwayStorage(env())).resolves.toBeUndefined();
    await expect(verifyRailwayStorage(env(path.join(root,"volume/new/data")))).resolves.toBeUndefined();
  });
  it("refuses missing volume or DATA_DIR",async()=>{
    await expect(verifyRailwayStorage({RAILWAY_ENVIRONMENT_ID:"test"})).rejects.toThrow("attached persistent volume");
    const e=env(); delete e.DATA_DIR; await expect(verifyRailwayStorage(e)).rejects.toThrow("attached persistent volume");
  });
  it("rejects ephemeral, relative and sibling prefix directories",async()=>{
    for(const dir of [path.join(root,"ephemeral"),path.join(root,"volume-other"),"data"])
      await expect(verifyRailwayStorage(env(dir))).rejects.toThrow();
  });
  it("rejects symlinks escaping the volume, including missing children",async()=>{
    await mkdir(path.join(root,"outside")); await symlink(path.join(root,"outside"),path.join(root,"volume/escape"));
    await expect(verifyRailwayStorage(env(path.join(root,"volume/escape")))).rejects.toThrow("resolves outside");
    await expect(verifyRailwayStorage(env(path.join(root,"volume/escape/new")))).rejects.toThrow("resolves outside");
  });
  it("refuses a missing mounted directory",async()=>{
    const e=env(); e.RAILWAY_VOLUME_MOUNT_PATH=path.join(root,"absent"); e.DATA_DIR=e.RAILWAY_VOLUME_MOUNT_PATH;
    await expect(verifyRailwayStorage(e)).rejects.toThrow();
  });
});
