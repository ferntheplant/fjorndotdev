// What `scripts/good.ts` works out about a link before it adds the link to the /good page: the
// type to suggest from the host, and the page's title from its HTML.
import type { GoodType } from "#src/lib/good.ts";

const VIDEO_HOSTS = new Set(["youtube.com", "youtu.be", "m.youtube.com"]);
const CODE_HOSTS = new Set(["github.com", "gitlab.com", "codeberg.org"]);

/** The type a link's host suggests; the CLI asks before it uses it. */
export const guessType = (url: URL): GoodType => {
  const host = url.hostname.replace(/^www\./u, "");
  if (VIDEO_HOSTS.has(host)) {
    return "youtube";
  }
  if (CODE_HOSTS.has(host)) {
    return "code";
  }
  return "article";
};

const NAMED_ENTITIES: readonly (readonly [RegExp, string])[] = [
  [/&quot;/gu, '"'],
  [/&apos;|&#39;/gu, "'"],
  [/&lt;/gu, "<"],
  [/&gt;/gu, ">"],
  // Last, so that an escaped entity such as `&amp;lt;` decodes to `&lt;` and no further.
  [/&amp;/gu, "&"],
];

export const decodeEntities = (text: string): string => {
  let decoded = text
    .replaceAll(/&#(?<code>\d+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replaceAll(/&#x(?<code>[\da-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
  for (const [entity, character] of NAMED_ENTITIES) {
    decoded = decoded.replaceAll(entity, character);
  }
  return decoded;
};

const META_TAG = /<meta\b[^>]*>/giu;
const META_CONTENT = /content=["'](?<content>[^"']*)["']/iu;
const TITLE_TAG = /<title[^>]*>(?<title>[^<]*)<\/title>/iu;

/** The `content` of the first non-empty `<meta>` tag whose `property` or `name` is `key`. */
export const metaContent = (html: string, key: string): string | undefined => {
  const keyAttribute = new RegExp(`(?:property|name)=["']${key}["']`, "iu");
  // Attribute order varies between sites, so match the tag first, then pull content out of it.
  for (const [tag] of html.matchAll(META_TAG)) {
    const content = META_CONTENT.exec(tag)?.groups?.content;
    if (
      keyAttribute.test(tag) &&
      content !== undefined &&
      content.trim() !== ""
    ) {
      return content;
    }
  }
  return undefined;
};

/**
 * The title a page gives itself: its Open Graph title, then its Twitter title, then `<title>`,
 * with entities decoded and the site suffixes YouTube and GitHub add removed.
 */
export const pageTitle = (html: string): string | undefined => {
  const raw =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    TITLE_TAG.exec(html)?.groups?.title;
  if (raw === undefined) {
    return undefined;
  }
  const title = decodeEntities(raw)
    .replaceAll(/\s+/gu, " ")
    .replace(/ - YouTube$/u, "")
    // "GitHub - owner/repo: description" becomes "owner/repo".
    .replace(/^GitHub - (?<repo>[^:]+):.*$/u, "$<repo>")
    .trim();
  return title === "" ? undefined : title;
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** `date` as a local calendar day (YYYY-MM-DD), which is what "the day I read it" means. */
export const calendarDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
