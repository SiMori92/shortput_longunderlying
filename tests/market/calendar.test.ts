import { expect, it } from "vitest";
import { expectedClose, futureExpiries, marketDate, marketMinute, previousSession, session, sessions } from "../../src/market/calendar";
it("matches published NYSE 2026/2027/2028 closures and half-days", () => {
  for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25", "2027-03-26", "2027-06-18", "2027-07-05", "2027-12-24", "2028-04-14", "2028-06-19", "2028-07-04", "2028-12-25"]) expect(session(d), d).toBeNull();
  for (const d of ["2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24"]) expect(session(d)).toMatchObject({ halfDay: true, closeMinute: 780 });
  expect(session("2027-12-31")).toMatchObject({ closeMinute: 960 }); // no observation for Saturday New Year
  expect(session("2026-11-25")).toMatchObject({ halfDay: false });
  expect(() => session("2029-01-02")).toThrow("unconfirmed");
});
it("observes exceptional closures and Juneteenth only from 2022", () => {
  for (const d of ["2012-10-29", "2012-10-30", "2018-12-05", "2025-01-09"]) expect(session(d)).toBeNull();
  expect(session("2021-06-18")).not.toBeNull(); expect(session("2022-06-20")).toBeNull();
});
it("holiday expiries are the final session in the Friday week", () => {
  expect(futureExpiries("2026-03-30", 2)).toEqual(["2026-04-02", "2026-04-10"]);
  expect(futureExpiries("2026-06-29", 2)).toEqual(["2026-07-02", "2026-07-10"]);
  expect(futureExpiries("2026-11-27", 2)).toEqual(["2026-12-04", "2026-12-11"]);
  expect(previousSession("2026-04-06")).toBe("2026-04-02");
  expect(sessions("2026-11-25", "2026-11-30")).toEqual(["2026-11-25", "2026-11-27", "2026-11-30"]);
});
it("ET day/minute and expected close respect DST and half-day grace", () => {
  expect(marketDate(new Date("2026-11-18T02:00:00Z"))).toBe("2026-11-17");
  expect(marketMinute(new Date("2026-07-01T19:40:00Z"))).toBe(940);
  expect(expectedClose(new Date("2026-11-17T21:14:00Z"))).toBe("2026-11-16");
  expect(expectedClose(new Date("2026-11-17T21:15:00Z"))).toBe("2026-11-17");
  expect(expectedClose(new Date("2026-11-27T18:15:00Z"))).toBe("2026-11-27");
});
