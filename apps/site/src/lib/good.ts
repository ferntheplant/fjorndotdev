// Shared by the `good` content collection and `scripts/good.ts`, so the CLI
// can't write an entry the site would reject.
import { z } from "astro/zod";

export const GOOD_FILE = "src/data/good.yaml";

export const goodTypes = ["article", "book", "youtube", "code"] as const;
export type GoodType = (typeof goodTypes)[number];

export const goodItemSchema = z.object({
  // Calendar date (YYYY-MM-DD) rather than a timestamp, so the displayed day
  // doesn't depend on the build machine's time zone.
  date: z.iso.date(),
  title: z.string().min(1),
  type: z.enum(goodTypes),
  url: z.url({ protocol: /^https?$/u }),
});
