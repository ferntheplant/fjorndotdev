import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";
import { parse } from "yaml";

import { GOOD_FILE, goodItemSchema } from "@/src/lib/good";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

const good = defineCollection({
  // Entries need an id; the URL is unique, so derive it rather than making
  // every hand-written entry repeat it.
  loader: file(GOOD_FILE, {
    parser: (text) =>
      (parse(text) as Array<Record<string, unknown>>).map((entry) => ({
        id: String(entry["url"]),
        ...entry,
      })),
  }),
  schema: goodItemSchema,
});

export const collections = { blog, good };
