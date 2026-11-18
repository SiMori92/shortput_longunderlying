import { randomBytes } from "node:crypto";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { hash } from "bcryptjs";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { AuthConfigSchema } from "../src/auth/config";
/** No password or TOTP secret is passed through argv, terminal echo, or logs. */
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
  const password = await prompt("New password (14+ characters; max 72 UTF-8 bytes): ", true);
  if (password.length < 14 || Buffer.byteLength(password) > 72) throw new Error("Password must have at least 14 characters and at most 72 UTF-8 bytes.");
  if (password !== await prompt("Confirm password: ", true)) throw new Error("Passwords differ");
  const origin = await prompt("App origin (https://your-host, or http://127.0.0.1:3000 locally): ");
  const secret = generateSecret();
  const config = AuthConfigSchema.parse({ AUTH_PASSWORD_HASH: await hash(password, 12), AUTH_TOTP_SECRET: secret, SESSION_SECRET: randomBytes(48).toString("hex"), APP_ORIGIN: origin });
  const dir = path.resolve(".auth-setup");
  await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700);
  const qr = path.join(dir, "totp.png");
  // Exclusive create prevents an accidental credential overwrite.
  const png = await QRCode.toBuffer(generateURI({ issuer: "Strategy Monitor", label: "owner", secret }), { width: 400 });
  await writeFile(qr, png, { flag: "wx", mode: 0o600 });
  stdout.write(`Open ${qr} locally and scan it in your authenticator. Keep this QR private.\n`);
  const token = await prompt("Enter a code to confirm enrollment: ", true);
  if (!/^\d{6}$/.test(token) || !(await verify({ secret, token, epochTolerance: 30 })).valid) throw new Error("Authenticator confirmation failed. Remove .auth-setup/totp.png and retry.");
  // Quotes preserve bcrypt '$' characters in shell/dotenv environments.
  await writeFile(".env.local", Object.entries(config).map(([key,value]) => `${key}='${value}'`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  stdout.write("Saved .env.local (0600). Restart the app. Store an encrypted backup, then delete .auth-setup/totp.png. Never commit or share these files.\n");
}
main().catch(error => { console.error(error instanceof Error && !error.name.includes("Zod") ? error.message : "Invalid setup configuration. Check the origin and retry."); process.exitCode = 1; });
