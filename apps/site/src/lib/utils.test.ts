import { describe, expect, it } from "vite-plus/test";

import { cn, formatCalendarDay, formatDate } from "#src/lib/utils.ts";

describe(cn, () => {
  it("lets a later Tailwind class win over a conflicting earlier one", () => {
    expect(cn("p-2 text-sm", false, "p-4")).toBe("text-sm p-4");
  });
});

describe(formatDate, () => {
  it("formats a date as a short US date", () => {
    expect(formatDate(new Date(2024, 7, 7))).toBe("Aug 07, 2024");
  });
});

describe(formatCalendarDay, () => {
  it("shows the same day in every time zone", () => {
    // UTC midnight is still the previous evening west of UTC; the day must not move.
    expect(formatCalendarDay("2024-08-07")).toBe("Aug 07, 2024");
    expect(formatCalendarDay("2024-01-01")).toBe("Jan 01, 2024");
  });
});
