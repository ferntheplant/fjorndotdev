import { describe, expect, it } from "vite-plus/test";

import {
  calendarDay,
  decodeEntities,
  guessType,
  metaContent,
  pageTitle,
} from "#src/lib/good-link.ts";

describe(guessType, () => {
  it.each([
    ["https://www.youtube.com/watch?v=x", "youtube"],
    ["https://youtu.be/x", "youtube"],
    ["https://github.com/owner/repo", "code"],
    ["https://codeberg.org/owner/repo", "code"],
    ["https://example.com/post", "article"],
  ])("guesses %s as %s", (url, type) => {
    expect(guessType(new URL(url))).toBe(type);
  });
});

describe(decodeEntities, () => {
  it("decodes numeric and named entities", () => {
    expect(
      decodeEntities("&#8220;A&#x27;s&#8221; &amp; &lt;b&gt; &quot;")
    ).toBe("“A's” & <b> \"");
  });

  it("decodes an escaped entity only once", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });
});

describe(metaContent, () => {
  it("finds the tag whatever the attribute order", () => {
    const html =
      '<meta content="First" property="og:title"><meta name="twitter:title" content="Second">';

    expect(metaContent(html, "og:title")).toBe("First");
    expect(metaContent(html, "twitter:title")).toBe("Second");
  });

  it("skips an empty tag and reports a missing one", () => {
    const html =
      '<meta property="og:title" content=" "><meta property="og:title" content="Kept">';

    expect(metaContent(html, "og:title")).toBe("Kept");
    expect(metaContent(html, "description")).toBeUndefined();
  });
});

describe(pageTitle, () => {
  it("prefers the Open Graph title over <title>", () => {
    expect(
      pageTitle('<title>Plain</title><meta property="og:title" content="Rich">')
    ).toBe("Rich");
  });

  it("strips the YouTube and GitHub suffixes and collapses whitespace", () => {
    expect(pageTitle("<title>A\n  talk - YouTube</title>")).toBe("A talk");
    expect(pageTitle("<title>GitHub - owner/repo: Does things</title>")).toBe(
      "owner/repo"
    );
  });

  it("reports a page with no usable title", () => {
    expect(pageTitle("<p>no title</p>")).toBeUndefined();
    expect(pageTitle("<title>   </title>")).toBeUndefined();
  });
});

describe(calendarDay, () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(calendarDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
