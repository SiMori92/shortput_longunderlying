import { calendarDays, shiftDate, weekday } from "../engine/dates";
export const MARKET_ZONE = "America/New_York";
// Published NYSE calendar + exchange holiday rules. Bounded deliberately: unknown
// future years fail closed until reviewed against a new exchange publication.
export const CALENDAR_MIN_YEAR = 2010, CALENDAR_MAX_YEAR = 2028;
const exceptionalClosures = new Set(["2012-10-29", "2012-10-30", "2018-12-05", "2025-01-09"]);
export function marketDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MARKET_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const p = Object.fromEntries(parts.map(p => [p.type, p.value])); return `${p.year}-${p.month}-${p.day}`;
}
export function marketMinute(now: Date): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: MARKET_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}
function date(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function nth(y: number, m: number, day: number, n: number) { const first = date(y, m, 1); return shiftDate(first, (day - weekday(first) + 7) % 7 + 7 * (n - 1)); }
function observed(d: string, saturday = true) { return weekday(d) === 5 && saturday ? shiftDate(d, -1) : weekday(d) === 6 ? shiftDate(d, 1) : d; }
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, n = Math.floor((a + 11 * h + 22 * l) / 451);
  const x = h + l - 7 * n + 114; return date(y, Math.floor(x / 31), x % 31 + 1);
}
const holidayCache = new Map<number, Set<string>>();
function holidays(y: number) {
  const cached = holidayCache.get(y); if (cached) return cached;
  const memorial = shiftDate(date(y, 5, 31), -weekday(date(y, 5, 31)));
  const days = new Set([observed(date(y, 1, 1), false), nth(y, 1, 0, 3), nth(y, 2, 0, 3), shiftDate(easter(y), -2), memorial,
    ...(y >= 2022 ? [observed(date(y, 6, 19))] : []), observed(date(y, 7, 4)), nth(y, 9, 0, 1), nth(y, 11, 3, 4), observed(date(y, 12, 25))]);
  holidayCache.set(y, days); return days;
}
export function session(d: string): { date: string; closeMinute: number; halfDay: boolean } | null {
  const y = Number(d.slice(0, 4));
  if (y < CALENDAR_MIN_YEAR || y > CALENDAR_MAX_YEAR) throw new Error(`NYSE calendar unconfirmed for ${y}`);
  if (weekday(d) > 4 || holidays(y).has(d) || exceptionalClosures.has(d)) return null;
  const halfDay = d === shiftDate(nth(y, 11, 3, 4), 1) || d === date(y, 7, 3) || d === date(y, 12, 24);
  return { date: d, closeMinute: halfDay ? 13 * 60 : 16 * 60, halfDay };
}
export function sessions(from: string, to: string): string[] {
  if (calendarDays(from, to) > 8000) throw new Error("Calendar range too large");
  const result: string[] = []; for (let d = from; d <= to; d = shiftDate(d, 1)) if (session(d)) result.push(d); return result;
}
export function previousSession(d: string): string { let p = shiftDate(d, -1); while (!session(p)) p = shiftDate(p, -1); return p; }
export function expectedClose(now: Date): string {
  const d = marketDate(now), s = session(d); return s && marketMinute(now) >= s.closeMinute + 15 ? d : previousSession(d);
}
export function futureExpiries(asOf: string, weeks = 4): string[] {
  const result: string[] = []; let friday = shiftDate(asOf, (4 - weekday(asOf) + 7) % 7);
  for (let i = 0; result.length < weeks; i++, friday = shiftDate(friday, 7)) {
    if (i > 10) throw new Error("No expiry sessions");
    let expiry = friday; while (!session(expiry)) expiry = shiftDate(expiry, -1);
    if (expiry > asOf) result.push(expiry);
  }
  return result;
}
