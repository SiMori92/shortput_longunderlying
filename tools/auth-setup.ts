import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { hash } from "bcryptjs";
import { AuthConfigSchema } from "../src/auth/config";
/** No password or secret is passed through argv, terminal echo, or logs. */
async function prompt(label: string, hidden = false): Promise<string> {
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    function cleanup() { stdin.off("data", listener); stdin.setRawMode(false); stdin.pause(); stdout.write("\n"); }
    function listener(chunk: string) {
      for (const ch of chunk) {
        if (ch === "\u0003") { cleanup(); reject(new Error("Cancelled")); return; }
        if (ch === "\r" || ch === "\n") { cleanup(); resolve(value); return; }
        if (ch === "\u007f" || ch === "\b") { if (value) { value = value.slice(0,-1); if (!hidden) stdout.write("\b \b"); } }
        else if (ch >= " " && ch !== "\u001b") { value += ch; if (!hidden) stdout.write(ch); }
      }
    }
    stdin.on("data", listener);
    stdout.write(label);
  });
}
async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Run auth:setup in an interactive terminal; credentials are never accepted as arguments.");
  const username = (await prompt("Account name (3-64 chars: letters, digits, . _ @ -): ")).trim();
  if (!/^[A-Za-z0-9._@-]{3,64}$/.test(username)) throw new Error("Account name must be 3-64 characters: letters, digits, . _ @ -");
  const password = await prompt("New password (8+ characters; max 72 UTF-8 bytes): ", true);
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw new Error("Password must have at least 8 characters and at most 72 UTF-8 bytes.");
  if (password !== await prompt("Confirm password: ", true)) throw new Error("Passwords differ");
  const origin = await prompt("App origin (https://your-host, or http://127.0.0.1:3000 locally): ");
  const config = AuthConfigSchema.parse({ AUTH_USERNAME: username, AUTH_PASSWORD_HASH: await hash(password, 12), SESSION_SECRET: randomBytes(48).toString("hex"), APP_ORIGIN: origin });
  // Quotes preserve bcrypt '$' characters in shell/dotenv environments.
  await writeFile(".env.local", Object.entries(config).map(([key,value]) => `${key}='${value}'`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  stdout.write("Saved .env.local (0600). Restart the app. Never commit or share this file.\n");
}
main().catch(error => { console.error(error instanceof Error && !error.name.includes("Zod") ? error.message : "Invalid setup configuration. Check the origin and retry."); process.exitCode = 1; });
