// Add a link to the /good page: `pnpm good <url> [--type T] [--title T] [--date YYYY-MM-DD] [--yes]`
// Quote URLs containing `?` or `&`, or the shell will mangle them.
//
// Fetches the page title, guesses the type from the host, lets you confirm or
// edit both, then prepends the entry to src/data/good.yaml (comments kept).
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { type Document, isMap, isSeq, parseDocument, Scalar } from "yaml";

import {
  GOOD_FILE,
  goodItemSchema,
  goodTypes,
  type GoodItem,
  type GoodType,
} from "../src/lib/good.ts";

const USAGE = `Usage: pnpm good <url> [--type ${goodTypes.join("|")}] [--title "..."] [--date YYYY-MM-DD] [--yes]`;

function fail(message: string): never {
  console.error(`good: ${message}`);
  process.exit(1);
}

function guessType(url: URL): GoodType {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com")
    return "youtube";
  if (host === "github.com" || host === "gitlab.com" || host === "codeberg.org")
    return "code";
  return "article";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, key: string): string | undefined {
  // Attribute order varies between sites, so match the tag first, then pull content out of it.
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (new RegExp(`(?:property|name)=["']${key}["']`, "i").test(tag)) {
      const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
      if (content?.trim()) return content;
    }
  }
  return undefined;
}

async function fetchTitle(url: URL): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; fjorn.dev good-links)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const raw =
      metaContent(html, "og:title") ??
      metaContent(html, "twitter:title") ??
      /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
    if (!raw) return undefined;
    return decodeEntities(raw)
      .replace(/\s+/g, " ")
      .replace(/ - YouTube$/, "")
      .replace(/^GitHub - ([^:]+):.*$/, "$1") // "GitHub - owner/repo: description"
      .trim();
  } catch {
    return undefined;
  }
}

function today(): string {
  // Local calendar date, which is what "the day I read it" means.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    type: { type: "string", short: "t" },
    title: { type: "string" },
    date: { type: "string", short: "d" },
    yes: { type: "boolean", short: "y", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const [rawUrl] = positionals;
if (!rawUrl || positionals.length > 1) fail(USAGE);
if (!URL.canParse(rawUrl)) fail(`not a valid URL: ${rawUrl}`);
const url = new URL(rawUrl);

// Widen from Document.Parsed so new (unparsed) nodes can be inserted.
const doc: Document = parseDocument(await readFile(GOOD_FILE, "utf8"));
const list = doc.contents;
if (!isSeq(list)) fail(`${GOOD_FILE} must be a YAML list`);

const existing = list.items.find(
  (item) => isMap(item) && item.get("url") === url.href,
);
if (existing && isMap(existing))
  fail(`already listed as "${String(existing.get("title"))}"`);

let title = values.title ?? (await fetchTitle(url));
let type = values.type ?? guessType(url);

if (!values.yes && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C / Ctrl+D reject the pending question; treat that as "never mind".
  const cancel = new AbortController();
  rl.on("SIGINT", () => cancel.abort());
  const ask = async (query: string) =>
    (await rl.question(query, { signal: cancel.signal })).trim();
  try {
    title = (await ask(`Title${title ? ` [${title}]` : ""}: `)) || title;
    type = (await ask(`Type (${goodTypes.join("/")}) [${type}]: `)) || type;
  } catch {
    console.error("\ngood: cancelled, nothing added");
    process.exit(130);
  } finally {
    rl.close();
  }
}

if (!title) fail("couldn't fetch a title; pass one with --title");

const parsed = goodItemSchema.safeParse({
  type,
  date: values.date ?? today(),
  title,
  url: url.href,
});
if (!parsed.success) {
  fail(
    parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n"),
  );
}
const item: GoodItem = parsed.data;

const node = doc.createNode(item);
// Keep dates quoted so YAML tooling never reinterprets them as timestamps.
const date = node.get("date", true);
if (date instanceof Scalar) date.type = Scalar.QUOTE_DOUBLE;
const first = list.items[0];
if (first && isMap(first)) first.spaceBefore = true;
list.items.unshift(node);

await writeFile(GOOD_FILE, doc.toString({ lineWidth: 0 }));
console.log(`good: added ${item.type} "${item.title}" (${item.date})`);
