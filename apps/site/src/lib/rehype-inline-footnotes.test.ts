import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import rehypeInlineFootnotes, {
  normalizeFootnoteId,
} from "#src/lib/rehype-inline-footnotes.ts";

// The same remark-gfm footnotes the site's MDX produces, rendered with and without the plugin.
const render = async (markdown: string, inline = true): Promise<string> => {
  const base = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);
  const pipeline = inline ? base.use(rehypeInlineFootnotes) : base;
  const file = await pipeline.use(rehypeStringify).process(markdown);
  return String(file);
};

const firstParagraph = (html: string): string =>
  html.slice(0, html.indexOf("</aside>") + "</aside>".length);

describe(normalizeFootnoteId, () => {
  it("reduces GFM's prefixed ids to fn-<number>", () => {
    expect(normalizeFootnoteId("user-content-fn-12")).toBe("fn-12");
    expect(normalizeFootnoteId("fn-3")).toBe("fn-3");
  });

  it("rejects ids that are not footnote definitions", () => {
    expect(normalizeFootnoteId("user-content-fnref-1")).toBeUndefined();
    expect(normalizeFootnoteId("fn-one")).toBeUndefined();
    expect(normalizeFootnoteId("")).toBeUndefined();
  });
});

describe(rehypeInlineFootnotes, () => {
  it("turns each reference into a button that controls its aside", async () => {
    const html = await render("Claim.[^1]\n\n[^1]: The evidence.\n");
    const paragraph = firstParagraph(html);

    expect(paragraph).toContain('type="button"');
    expect(paragraph).toContain('aria-controls="fn-inline-1"');
    expect(paragraph).toContain('aria-expanded="false"');
    expect(paragraph).toContain('class="footnote-ref"');
    expect(paragraph).not.toContain('href="#user-content-fn-1"');
  });

  it("puts a hidden copy of the definition right after the block", async () => {
    const html = await render("Claim.[^1]\n\n[^1]: The evidence.\n");
    const paragraph = firstParagraph(html);
    const aside = /<\/p>\n?(?<tag><aside[^>]*>)/u.exec(paragraph)?.groups?.tag;
    expect(aside).toContain('id="fn-inline-1"');
    expect(aside).toMatch(/\shidden[\s>]/u);
    expect(paragraph).toContain("The evidence.");
  });

  it("drops the backref link from the inline copy only", async () => {
    const html = await render("Claim.[^1]\n\n[^1]: The evidence.\n");

    expect(firstParagraph(html)).not.toContain("data-footnote-backref");
    expect(html.slice(firstParagraph(html).length)).toContain(
      "data-footnote-backref"
    );
  });

  it("shares one aside between two references to one footnote in a block", async () => {
    const html = await render("One[^1] and again[^1].\n\n[^1]: Shared.\n");

    expect(html.match(/<aside/gu)).toHaveLength(1);
    expect(html.match(/class="footnote-ref"/gu)).toHaveLength(2);
  });

  it("leaves a document without footnotes unchanged", async () => {
    const markdown = "Plain [link](#fn-1) text.\n";

    await expect(render(markdown)).resolves.toBe(await render(markdown, false));
  });

  it("leaves a reference to a footnote with no definition as a link", async () => {
    const html = await render("Real[^1], fake [x](#fn-9).\n\n[^1]: Note.\n");

    expect(html).toContain('href="#fn-9"');
    expect(html).not.toContain("fn-inline-9");
  });
});
