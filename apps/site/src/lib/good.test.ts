import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";

import { GOOD_FILE, goodItemSchema } from "#src/lib/good.ts";

const valid = {
  date: "2026-11-07",
  title: "A post",
  type: "article",
  url: "https://example.com/post",
};

describe("the good link schema", () => {
  it("accepts a complete entry", () => {
    expect(goodItemSchema.safeParse(valid).success).toBeTruthy();
  });

  it.each([
    ["a timestamp instead of a calendar day", { date: "2026-11-07T10:00:00Z" }],
    ["an empty title", { title: "" }],
    ["an unknown type", { type: "podcast" }],
    ["a non-web URL", { url: "ftp://example.com/file" }],
  ])("rejects %s", (_reason, change) => {
    expect(
      goodItemSchema.safeParse({ ...valid, ...change }).success
    ).toBeFalsy();
  });

  it("accepts every entry in the committed list", () => {
    const path = fileURLToPath(new URL(`../../${GOOD_FILE}`, import.meta.url));
    const entries: unknown = parse(readFileSync(path, "utf-8"));

    expect(Array.isArray(entries)).toBeTruthy();
    expect(goodItemSchema.array().safeParse(entries).error).toBeUndefined();
  });
});
