import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";
import { parse } from "yaml";

import { GOOD_FILE, goodItemSchema } from "#src/lib/good.ts";

const blog = defineCollection({
  loader: glob({ base: "./src/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    description: z.string(),
    draft: z.boolean().default(false),
    pubDate: z.coerce.date(),
    title: z.string(),
  }),
});

// Just enough shape to derive each entry's id; `schema` below checks the rest of each entry.
const goodEntries = z.array(z.looseObject({ url: z.string() }));

const good = defineCollection({
  // Entries need an id; the URL is unique, so derive it rather than making
  // every hand-written entry repeat it.
  loader: file(GOOD_FILE, {
    parser: (text) =>
      goodEntries.parse(parse(text)).map((entry) => ({
        id: entry.url,
        ...entry,
      })),
  }),
  schema: goodItemSchema,
});

export const collections = { blog, good };
