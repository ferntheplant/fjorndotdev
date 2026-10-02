import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | Date): string {
  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    // A bare calendar date ("2024-08-07") parses as UTC midnight; format it in
    // UTC too, or time zones west of UTC show the previous day.
    ...(typeof dateString === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateString) && { timeZone: "UTC" }),
  };
  return date.toLocaleDateString("en-US", options);
}
