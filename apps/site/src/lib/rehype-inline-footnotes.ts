/**
 * Inline GFM footnotes: inject an `<aside>` after the block that holds each reference, and turn
 * the reference link into a button that toggles it. Works with ids like "fn-1" and
 * "user-content-fn-1", and drops the backref links that GFM puts inside each definition.
 */
import type {
  Element,
  ElementContent,
  Nodes,
  Parents,
  Properties,
  Root,
} from "hast";
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

const BACKREF_CLASSES = new Set(["data-footnote-backref", "footnote-backref"]);

const FOOTNOTE_ID = /(?:^|-)fn-(?<number>\d+)$/u;

const isElement = (node: Nodes | undefined, tag?: string): node is Element =>
  node?.type === "element" && (tag === undefined || node.tagName === tag);

/** A property's value as text; an absent property is the empty string. */
const propertyText = (value: Properties[string]): string =>
  value === undefined || value === null ? "" : String(value);

/** "user-content-fn-1" and "fn-1" both become "fn-1"; anything else is not a footnote. */
export const normalizeFootnoteId = (id: string): string | undefined => {
  const number = FOOTNOTE_ID.exec(id)?.groups?.number;
  return number === undefined ? undefined : `fn-${number}`;
};

const classesOf = (element: Element): string[] => {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
};

const isBackref = (node: ElementContent): boolean =>
  isElement(node, "a") &&
  (classesOf(node).some((name) => BACKREF_CLASSES.has(name)) ||
    Boolean(node.properties["data-footnote-backref"]));

/** A copy of `node` with every backref anchor in its subtree removed. */
const withoutBackrefs = (node: ElementContent): ElementContent => {
  if (node.type !== "element") {
    return structuredClone(node);
  }
  return {
    ...structuredClone(node),
    children: node.children
      .filter((child) => !isBackref(child))
      .map(withoutBackrefs),
  };
};

/** Each footnote definition's content, keyed by its normalized id. */
const collectDefinitions = (tree: Root): Map<string, ElementContent[]> => {
  const definitions = new Map<string, ElementContent[]>();
  visitParents(tree, "element", (node) => {
    if (node.tagName !== "li") {
      return;
    }
    const id = normalizeFootnoteId(propertyText(node.properties.id));
    if (id !== undefined) {
      definitions.set(id, node.children.map(withoutBackrefs));
    }
  });
  return definitions;
};

/** The nearest block ancestor's parent, and that block's index in it. */
const blockSlot = (
  ancestors: readonly Parents[]
): { parent: Parents; index: number } | undefined => {
  for (let depth = ancestors.length - 1; depth > 0; depth -= 1) {
    const block = ancestors[depth];
    const parent = ancestors[depth - 1];
    if (isElement(block) && BLOCK_TAGS.has(block.tagName) && parent) {
      const index = parent.children.indexOf(block);
      if (index !== -1) {
        return { index, parent };
      }
    }
  }
  return undefined;
};

/** The footnote id a link points at, if the link is a footnote reference. */
const referencedId = (link: Element): string | undefined => {
  const href = propertyText(link.properties.href);
  const hash = href.indexOf("#");
  return link.tagName === "a" && hash !== -1
    ? normalizeFootnoteId(href.slice(hash + 1))
    : undefined;
};

const inlineIdOf = (id: string): string =>
  `fn-inline-${id.replace(/^fn-/u, "")}`;

/** A button, so that a click toggles the aside instead of jumping down the page. */
const makeToggle = (link: Element, id: string): void => {
  const { href: _href, ...properties } = link.properties;
  link.tagName = "button";
  link.properties = {
    ...properties,
    "aria-controls": inlineIdOf(id),
    "aria-expanded": "false",
    className: [...classesOf(link), "footnote-ref"],
    "data-fn-id": id,
    type: "button",
  };
};

/** A hidden copy of the definition right after the block, unless one is already there. */
const insertAside = (
  slot: { parent: Parents; index: number },
  id: string,
  definition: readonly ElementContent[]
): void => {
  // Two references to one footnote in the same block share one aside.
  const next = slot.parent.children[slot.index + 1];
  if (isElement(next, "aside") && next.properties["data-fn-id"] === id) {
    return;
  }
  const aside: Element = {
    children: definition.map((child) => structuredClone(child)),
    properties: {
      className: ["footnote-inline"],
      "data-fn-id": id,
      hidden: true,
      id: inlineIdOf(id),
    },
    tagName: "aside",
    type: "element",
  };
  slot.parent.children.splice(slot.index + 1, 0, aside);
};

const inlineFootnotes = (tree: Root): void => {
  const definitions = collectDefinitions(tree);
  if (definitions.size === 0) {
    return;
  }
  visitParents(tree, "element", (node, ancestors) => {
    const id = referencedId(node);
    const definition = id === undefined ? undefined : definitions.get(id);
    const slot = blockSlot(ancestors);
    if (id !== undefined && definition !== undefined && slot !== undefined) {
      makeToggle(node, id);
      insertAside(slot, id, definition);
    }
  });
};

export default function rehypeInlineFootnotes() {
  return inlineFootnotes;
}
