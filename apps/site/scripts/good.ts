// Add a link to the /good page:
//   vp run --filter @fjorndotdev/site good:add <url> [--type T] [--title T] [--date YYYY-MM-DD] [--yes]
// Quote URLs containing `?` or `&`, or the shell will mangle them.
//
// Fetches the page title, guesses the type from the host, lets you confirm or edit both, then
// prepends the entry to src/data/good.yaml (comments kept).
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { isMap, isSeq, parseDocument, Scalar } from "yaml";
import type { Document } from "yaml";

import { calendarDay, guessType, pageTitle } from "#src/lib/good-link.ts";
import { GOOD_FILE, goodItemSchema, goodTypes } from "#src/lib/good.ts";

const USAGE = `Usage: vp run --filter @fjorndotdev/site good:add <url> [--type ${goodTypes.join("|")}] [--title "..."] [--date YYYY-MM-DD] [--yes]`;

// Annotated, so that TypeScript narrows after a call (it needs an explicit type to do that).
const fail: (message: string) => never = (message) => {
  console.error(`good: ${message}`);
  process.exit(1);
};

const fetchTitle = async (url: URL): Promise<string | undefined> => {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; fjorn.dev good-links)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? pageTitle(await response.text()) : undefined;
  } catch {
    // An unreachable page is not an error: the prompt, or --title, supplies the title instead.
    return undefined;
  }
};

/** The answer to `query`, or `fallback` when the answer is empty. */
const askOr = async (
  ask: (query: string) => Promise<string>,
  query: string,
  fallback: string
): Promise<string> => {
  const answer = await ask(query);
  return answer === "" ? fallback : answer;
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    date: { short: "d", type: "string" },
    help: { default: false, short: "h", type: "boolean" },
    title: { type: "string" },
    type: { short: "t", type: "string" },
    yes: { default: false, short: "y", type: "boolean" },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const [rawUrl] = positionals;
if (rawUrl === undefined || positionals.length > 1) {
  fail(USAGE);
}
const url = URL.parse(rawUrl) ?? fail(`not a valid URL: ${rawUrl}`);

// Widen from Document.Parsed so new (unparsed) nodes can be inserted.
const source = await readFile(GOOD_FILE, "utf-8");
const doc: Document = parseDocument(source);
const list = doc.contents;
if (!isSeq(list)) {
  fail(`${GOOD_FILE} must be a YAML list`);
}

const existing = list.items.find(
  (item) => isMap(item) && item.get("url") === url.href
);
if (isMap(existing)) {
  fail(`already listed as "${String(existing.get("title"))}"`);
}

let title = values.title ?? (await fetchTitle(url)) ?? "";
let type = values.type ?? guessType(url);

if (!values.yes && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C / Ctrl+D reject the pending question; treat that as "never mind".
  const cancel = new AbortController();
  rl.on("SIGINT", () => {
    cancel.abort();
  });
  const ask = async (query: string) => {
    const answer = await rl.question(query, { signal: cancel.signal });
    return answer.trim();
  };
  try {
    title = await askOr(
      ask,
      `Title${title === "" ? "" : ` [${title}]`}: `,
      title
    );
    type = await askOr(ask, `Type (${goodTypes.join("/")}) [${type}]: `, type);
  } catch {
    console.error("\ngood: cancelled, nothing added");
    process.exit(130);
  } finally {
    rl.close();
  }
}

if (title === "") {
  fail("couldn't fetch a title; pass one with --title");
}

const parsed = goodItemSchema.safeParse({
  date: values.date ?? calendarDay(new Date()),
  title,
  type,
  url: url.href,
});
if (!parsed.success) {
  fail(
    parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
  );
}
const item = parsed.data;

// The order every entry in the file already uses; the schema's keys are sorted instead.
const FIELD_ORDER = ["type", "date", "title", "url"] as const;
const node = doc.createNode(
  Object.fromEntries(FIELD_ORDER.map((field) => [field, item[field]]))
);
// Keep dates quoted so YAML tooling never reinterprets them as timestamps.
const date = node.get("date", true);
if (date instanceof Scalar) {
  date.type = Scalar.QUOTE_DOUBLE;
}
const [first] = list.items;
if (isMap(first)) {
  first.spaceBefore = true;
}
list.items.unshift(node);

await writeFile(GOOD_FILE, doc.toString({ lineWidth: 0 }));
console.log(`good: added ${item.type} "${item.title}" (${item.date})`);
