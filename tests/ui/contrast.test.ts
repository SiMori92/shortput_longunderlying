import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the live :root tokens so a palette edit cannot silently break WCAG AA (workbook §3, §10).
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const tokens = new Map([...root.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1]!, m[2]!.toLowerCase()]));
function hex(name: string) { const value = name.startsWith("#") ? name : tokens.get(name); if (!value) throw new Error(`Missing token ${name}`); return value; }
function luminance(value: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) as [number, number, number];
  return .2126 * r + .7152 * g + .0722 * b;
}
function ratio(a: string, b: string) { const [x, y] = [luminance(hex(a)), luminance(hex(b))]; return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

describe("garden study contrast", () => {
  const text: [string, string, string][] = [
    ["main text on surface", "--color-text", "--color-surface"],
    ["main text on background", "--color-text", "--color-bg"],
    ["muted text on surface", "--color-muted", "--color-surface"],
    ["muted text on background", "--color-muted", "--color-bg"],
    ["muted text on table head", "--color-muted", "--color-table-head"],
    ["white on primary action", "#ffffff", "--color-action"],
    ["white on primary hover", "#ffffff", "--color-action-hover"],
    ["action link on surface", "--color-action", "--color-surface"],
    ["success badge", "--color-success", "--color-success-bg"],
    ["warning badge", "--color-warning", "--color-warning-bg"],
    ["danger badge", "--color-danger", "--color-danger-bg"],
    ["active badge", "--color-active", "--color-active-bg"],
    ["neutral badge", "--color-neutral", "--color-neutral-bg"],
    ["danger text on surface", "--color-danger", "--color-surface"],
    ["warning text on surface", "--color-warning", "--color-surface"],
    ["success text on surface", "--color-success", "--color-surface"],
    ["chart ink on chart surface", "--chart-ink", "--chart-surface"],
    ["chart secondary ink on chart surface", "--chart-ink-2", "--chart-surface"],
    ["surface text on red-earth footer", "--color-surface", "--d4"],
  ];
  it.each(text)("%s reaches 4.5:1", (_, fg, bg) => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));

  const ui: [string, string, string][] = [
    ["focus outline on surface", "--color-focus", "--color-surface"],
    ["focus outline on background", "--color-focus", "--color-bg"],
    ["input border on surface", "--color-line", "--color-surface"],
    ["input border on input fill", "--color-line", "--color-input"],
    ...[1, 2, 4, 5, 6, 8].map(n => [`series ${n} on chart surface`, `--series-${n}`, "--chart-surface"] as [string, string, string]),
    ["good status mark", "--status-good", "--chart-surface"],
    ["critical status mark", "--status-critical", "--chart-surface"],
    ["serious status mark", "--status-serious", "--chart-surface"],
  ];
  it.each(ui)("%s reaches 3:1", (_, fg, bg) => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3));

  it("ochre and olive series stay below 3:1, so charts using them need direct labels", () => {
    expect(ratio("--series-3", "--chart-surface")).toBeLessThan(3);
    expect(ratio("--series-7", "--chart-surface")).toBeLessThan(3);
  });
  it("ochre is never legible as text on chalk (it stays a line)", () => expect(ratio("--d1", "--color-surface")).toBeLessThan(3));
});
