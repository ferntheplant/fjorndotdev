import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/** A post's publication date, as "Aug 07, 2024", in the build machine's time zone. */
export const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", DATE_FORMAT);

/**
 * A calendar day ("2024-08-07") as "Aug 07, 2024". The day parses as UTC midnight, so it is
 * formatted in UTC too; otherwise time zones west of UTC would show the previous day.
 */
export const formatCalendarDay = (day: string): string =>
  new Date(day).toLocaleDateString("en-US", {
    ...DATE_FORMAT,
    timeZone: "UTC",
  });
