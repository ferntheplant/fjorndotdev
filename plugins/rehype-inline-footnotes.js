// plugins/rehype-inline-footnotes.js
// @ts-check
/**
 * Inline GFM footnotes: inject <aside> after the block containing the ref,
 * and rewrite the ref href to point to the inline aside. Works with ids like
 * "fn-1" and "user-content-fn-1", and removes in-paragraph backref links.
 *
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Parent} Parent
 * @typedef {import('hast').Content} Content
 */
import { visitParents } from "unist-util-visit-parents";

const BLOCK_TAGS = new Set([
  "p",
  "li",
  "blockquote",
  "figure",
  "div",
  "section",
  "article",
]);

/** @param {any} node @param {string=} tag */
function isElement(node, tag) {
  return node && node.type === "element" && (!tag || node.tagName === tag);
}

function normalizeFnId(id) {
  // Accept "...fn-<number>" → "fn-<number>"
  const m = String(id).match(/(?:^|-)fn-(\d+)$/);
  return m ? `fn-${m[1]}` : null;
}

/** Deep clone a HAST node (good enough for our usage) */
function clone(node) {
  return JSON.parse(JSON.stringify(node));
}

/** Remove backlink anchors (in-place) anywhere in the subtree */
function stripBackrefs(node) {
  if (!node || typeof node !== "object") return node;
  if (!("children" in node) || !Array.isArray(node.children)) return node;

  /** @type {Content[]} */
  const out = [];
  for (const child of node.children) {
    if (isElement(child, "a")) {
      const cls = /** @type {string[]|undefined} */ (
        child.properties?.className
      );
      const hasBackrefClass =
        Array.isArray(cls) &&
        (cls.includes("data-footnote-backref") ||
          cls.includes("footnote-backref"));
      const hasBackrefAttr = !!child.properties?.["data-footnote-backref"];
      if (hasBackrefClass || hasBackrefAttr) {
        // drop this anchor entirely
        continue;
      }
    }
    const c = clone(child);
    stripBackrefs(c);
    out.push(c);
  }
  node.children = out;
  return node;
}

/** @type {import('unified').Plugin<[], Root>} */
export default function rehypeInlineFootnotes() {
  return /** @param {Root} tree */ (tree) => {
    /** @type {Record<string, Content[]>} */
    const defs = {};

    // 1) Collect definitions from bottom list: <li id="...fn-x">…</li>
    visitParents(tree, "element", (node) => {
      if (!isElement(node, "li") || !node.properties?.id) return;
      const norm = normalizeFnId(node.properties.id);
      if (!norm) return;

      const kids = Array.isArray(node.children) ? node.children : [];
      // Clone and strip backref anchors inside paragraphs
      /** @type {Content[]} */
      const cleaned = kids.map((k) => stripBackrefs(clone(k)));
      defs[norm] = cleaned;
    });

    if (!Object.keys(defs).length) return;

    // 2) For each reference <a href="...#fn-x">, inject <aside> after nearest block
    visitParents(tree, "element", (node, ancestors) => {
      if (!isElement(node, "a")) return;
      const href = /** @type {string|undefined} */ (node.properties?.href);
      if (!href) return;

      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;

      const norm = normalizeFnId(href.slice(hashIndex + 1));
      if (!norm) return;

      const def = defs[norm];
      if (!def) return;

      /** @type {Parent|undefined} */
      let insertParent;
      let indexInParent = -1;

      // Find closest block ancestor and its parent
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const anc = ancestors[i];
        if (isElement(anc) && BLOCK_TAGS.has(anc.tagName)) {
          const maybeParent = /** @type {Parent|undefined} */ (
            ancestors[i - 1]
          );
          if (
            maybeParent &&
            Array.isArray(/** @type {any} */ (maybeParent).children)
          ) {
            indexInParent = /** @type {any} */ (maybeParent).children.indexOf(
              anc,
            );
            if (indexInParent >= 0) {
              insertParent = maybeParent;
              break;
            }
          }
        }
      }
      if (!insertParent) return;
      // --- inside visitParents(...) where you have `norm`, `insertParent`, `indexInParent` ---

      const inlineId = `fn-inline-${norm.replace(/^fn-/, "")}`;

      // Turn the link into a button so it won't jump the page
      node.tagName = "button";
      node.properties = {
        ...(node.properties || {}),
        type: "button",
        className: [...(node.properties?.className || []), "footnote-ref"],
        "data-fn-id": norm,
        "aria-expanded": "false",
        "aria-controls": inlineId,
      };
      delete node.properties.href; // remove the hash link

      // Avoid duplicates if multiple refs live in the same block
      const next = /** @type {Element|undefined} */ (
        /** @type {any} */ (insertParent).children[indexInParent + 1]
      );
      if (isElement(next, "aside") && next.properties?.["data-fn-id"] === norm)
        return;

      const aside = {
        type: "element",
        tagName: "aside",
        properties: {
          id: inlineId,
          className: ["footnote-inline"],
          "data-fn-id": norm,
          hidden: true, // start hidden
        },
        children: def.map(clone),
      };

      insertParent /** @type {any} */.children
        .splice(indexInParent + 1, 0, aside);
    });
  };
}
