import { localDate } from "@disciplined-sidekick/core";

const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** "Thu, Nov 5"; a day outside the current day's year adds it: "Tue, Dec 30, 2025". */
export function shortDay(date: string, currentDate: string) {
  const sameYear = date.slice(0, 4) === currentDate.slice(0, 4);
  return parse(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Thursday, November 5": what assistive tech reads in place of the short date. */
export const fullDay = (date: string) =>
  parse(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

/** The calendar day `by` days from `date` (YYYY-MM-DD), whatever the DST shifts. */
export function shiftDay(date: string, by: number) {
  const d = parse(date);
  d.setDate(d.getDate() + by);
  return localDate(d);
}
