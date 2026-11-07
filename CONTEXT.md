# Context

<!-- The project's vocabulary: one entry per term that means something specific here. Add a term when code or discussion starts using it, and keep each definition to what the word means in this project, not what it means in general. Sort entries alphabetically. -->

**Base** — the upstream commit a copied file was last merged from, recorded in `.baseline.jsonc` (the template) or `.agents/vendored-skills.jsonc` (a skill). `/rebaseline` merges upstream's changes since the base into the local copy.

**Good link** — one entry on the /good page: a link Fern recommends, with a **type** (`article`, `book`, `youtube`, or `code`), the calendar day it was added, and a title. The entries live in `apps/site/src/data/good.yaml`, and `good:add` adds one.

**Inline footnote** — a post's footnote shown in place: the reference becomes a button that opens a copy of the footnote right after the paragraph. The GFM footnote list at the end of the post stays too.

**Post** — one blog post: an MDX file in `apps/site/src/blog/`. A post with `draft: true` in its frontmatter is built but not listed on /blog.

**Vendored skill** — a skill copied from another repo into `.agents/skills/` and edited in place, with its source and base recorded in `.agents/vendored-skills.jsonc`. A skill with no entry there is the repo's own.
