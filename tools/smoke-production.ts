import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { hashSync } from "bcryptjs";
import { HealthSchema } from "../src/schemas/api";
import { AuthResponseSchema } from "../src/schemas/auth";
import { PortfolioStateSchema } from "../src/schemas/portfolio";
const source = process.cwd(), staging = await mkdtemp(path.join(os.tmpdir(), "strategy-production-"));
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0,"127.0.0.1",resolve));
const port = (probe.address() as AddressInfo).port;
await new Promise<void>((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));
const base = `http://127.0.0.1:${port}`, origin = "https://strategy-smoke.example";
const password = "standalone-smoke-only-password", username = "smoke-owner", passwordHash = hashSync(password,10);
let child: ChildProcess | undefined, log = "";
function launch(configured: boolean, volume: boolean) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", HOSTNAME: "0.0.0.0", PORT: String(port), DATA_DIR: path.join(staging,"data"), APP_ORIGIN: origin, AUTH_PASSWORD_HASH: configured ? passwordHash : "", AUTH_USERNAME: configured ? username : "", SESSION_SECRET: configured ? "standalone-smoke-only-session-secret-32-bytes" : "", RAILWAY_ENVIRONMENT_ID: "isolated-railway-smoke", RAILWAY_VOLUME_MOUNT_PATH: volume ? staging : "" };
  const running = spawn(process.execPath, ["server.js"], { cwd: staging, env, stdio: ["ignore","pipe","pipe"] });
  child = running;
  running.stdout!.on("data", data => { log += String(data); }); running.stderr!.on("data", data => { log += String(data); });
  return running;
}
async function start(configured: boolean) {
  const running = launch(configured,true);
  for (let i = 0; i < 150; i++) {
    if (running.exitCode !== null) throw new Error("Standalone server exited early");
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* wait for initialization */ }
    await new Promise(resolve => setTimeout(resolve,200));
  }
  throw new Error("Standalone server startup timed out");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const running=child;
  const exited = new Promise<void>(resolve => running.once("exit", () => resolve()));
  const timer=setTimeout(()=>running.kill("SIGKILL"),5000); timer.unref();
  running.kill("SIGTERM"); await exited; clearTimeout(timer); child = undefined;
}
try {
  assert(!(await readdir(".next/standalone")).some(name => ["data","tests","reports",".auth-setup"].includes(name) || name.startsWith(".env")));
  await cp(path.join(source,".next/standalone"),staging,{recursive:true,verbatimSymlinks:true});
  for(const [from,to] of [[".next/static",".next/static"],["public","public"],["seed","seed"],["config","config"]])
    await cp(path.join(source,from!),path.join(staging,to!),{recursive:true});
  launch(false,false);
  for(let i=0;i<100 && !log.includes("Railway requires an attached persistent volume");i++) await new Promise(resolve=>setTimeout(resolve,100));
  assert(log.includes("Railway requires an attached persistent volume"));
  let readiness=0;
  try { readiness=(await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(3000)})).status; } catch { /* refusing the connection also fails readiness */ }
  assert(readiness<200 || readiness>=300,"Missing volume must never pass Railway readiness");
  assert(!log.includes("[scheduler] Registered"));
  await assert.rejects(readFile(path.join(staging,"data/bars/SOXL.json")),{code:"ENOENT"});
  await stop(); log="";
  console.info("PASS: Railway startup refuses a missing persistent-volume configuration");
  await start(false);
  const health=await fetch(`${base}/api/health`); assert.equal(health.status,200); HealthSchema.parse(await health.json());
  for(const url of ["/","/gate","/puts","/portfolio","/spax","/backtest","/rules"]) {
    const response=await fetch(base+url,{redirect:"manual"}); assert.equal(response.status,307); assert(response.headers.get("location")?.endsWith("/login"));
  }
  const loginPage=await (await fetch(`${base}/login`)).text(); assert(loginPage.includes("Setup required"));
  for(const url of ["/api/portfolio","/api/runs","/api/monitors"]) assert.equal((await fetch(base+url)).status,401);
  const seed = await readFile(path.join(staging,"data/bars/SOXL.json"),"utf8");
  assert(seed.includes('"2010-')); assert(log.includes("[scheduler] Registered"));
  await stop(); await start(true);
  const headers = {origin,"content-type":"application/json","x-forwarded-proto":"https","x-forwarded-host":"strategy-smoke.example"};
  const input = {username,password};
  const result = await fetch(`${base}/api/auth/login`,{method:"POST",headers,body:JSON.stringify(input)});
  assert.equal(result.status,200); assert(AuthResponseSchema.parse(await result.json()).ok);
  const issued=result.headers.get("set-cookie")!;
  for(const flag of ["Secure","HttpOnly","SameSite=strict","Path=/"]) assert(issued.includes(flag));
  const cookie = issued.split(";")[0]!, authorized = {...headers,cookie};
  let state = PortfolioStateSchema.parse(await (await fetch(`${base}/api/portfolio`,{headers:authorized})).json());
  const entry = {date:"2026-11-16",accountValue:123456,shares:12,openPuts:[]};
  assert.equal((await fetch(`${base}/api/portfolio`,{method:"PUT",headers:authorized,body:JSON.stringify({operation:"snapshot",revision:state.revision,entry})})).status,200);
  assert.equal((await fetch(`${base}/api/portfolio`,{method:"PUT",headers:{...authorized,origin:"https://attacker.example","x-forwarded-host":"attacker.example"},body:"{}"})).status,403);
  await stop(); await start(true);
  assert.equal(await readFile(path.join(staging,"data/bars/SOXL.json"),"utf8"),seed);
  state = PortfolioStateSchema.parse(await (await fetch(`${base}/api/portfolio`,{headers:authorized})).json()); assert.deepEqual(state.entries,[entry]);
  assert.equal((await fetch(`${base}/api/auth/login`,{method:"POST",headers,body:JSON.stringify({...input,password:"wrong-password-value"})})).status,401);
  let html="";
  for (const [url,title] of [["/","Today"],["/gate","Gate"],["/puts","Puts"],["/portfolio","Portfolio"],["/spax","SPAX monitor"],["/backtest","Backtest"],["/rules","Rules"]]) {
    const response=await fetch(base+url,{headers:authorized,redirect:"manual"}); assert.equal(response.status,200); assert.equal(response.headers.get("cache-control"),"no-store");
    html=await response.text();
    const heading=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<!--[\s\S]*?-->/g,"").replace(/<[^>]*>/g,"");
    assert(heading?.includes(title!),`Missing page heading: ${url}`);
  }
  const asset=html.match(/src="([^"\s]*\/_next\/static\/[^"\s]+)"/)?.[1]; assert(asset,"Missing browser JS asset");
  assert.equal((await fetch(new URL(asset,base))).status,200);
  assert.equal((await fetch(`${base}/api/auth/logout`,{method:"POST",headers:authorized})).status,200);
  assert.equal((await fetch(`${base}/api/portfolio`)).status,401);
  console.info("PASS: standalone package excludes runtime data, env, enrollment, tests and reports");
  console.info("PASS: dynamic PORT + 0.0.0.0 startup seeds an empty volume directory and registers the ET scheduler");
  console.info("PASS: unsigned pages/APIs stay private; account name + password issues a Secure/HttpOnly/SameSite cookie");
  console.info("PASS: configured HTTPS origin works through simulated proxy headers; cross-site writes return 403");
  console.info("PASS: restart preserves bars, API-entered snapshot, signed session; wrong password still rejected");
  console.info("PASS: all seven authenticated pages render expected content; browser JS asset is served");
  console.info("PASS: logout endpoint works and unsigned API access remains blocked");
  console.info("LIMITATION: simulated Railway environment on local Node; actual Docker, Railway volume permissions, TLS and remote service settings are unverified");
} catch(error) { console.error(log.slice(-4000)); throw error; }
finally { await stop(); await rm(staging,{recursive:true,force:true}); }
