import { describe, expect, it } from "vitest";
import { fullDay, shiftDay, shortDay } from "./day-label";

describe("day labels", () => {
  it("writes the short date without the year in the current year", () => {
    expect(shortDay("2026-11-05", "2026-11-06")).toBe("Thu, Nov 5");
  });

  it("adds the year for another year", () => {
    expect(shortDay("2025-12-30", "2026-11-06")).toBe("Tue, Dec 30, 2025");
  });

  it("writes the full date for assistive tech", () => {
    expect(fullDay("2026-11-05")).toBe("Thursday, November 5");
  });

  it("steps by calendar day across month and year ends", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});
