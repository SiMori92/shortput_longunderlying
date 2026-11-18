const DAY_MS = 86_400_000;
export function calendarDays(from: string, to: string): number { return (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY_MS; }
export function weekday(date: string): number { return (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7; }
export function shiftDate(date: string, days: number): string { return new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10); }
/** pandas W-FRI periods run Saturday through Friday (not ISO-week Monday). */
export function weekId(date: string): string {
  const end = shiftDate(date, (4 - weekday(date) + 7) % 7);
  return `${shiftDate(end, -6)}/${end}`;
}
