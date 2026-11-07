// `CLAUDE.md` and `.claude/` are relative symlinks so every agent reads one set of
// instructions. Two things stop them from simply being committed and left alone:
//
//   - `vp create github:<repo>` extracts with degit, which rewrites a relative symlink into an
//     absolute path inside its own cache — then deletes that cache, leaving the link dangling.
//     "Download ZIP" drops symlinks entirely. `git clone` preserves them.
//   - `vp create` writes agent instruction files itself, and does it *before* installing. It
//     will not write around a `CLAUDE.md` that already exists: it dies with EEXIST when it
//     wants to create the symlink, or ENOENT when the one it finds is degit-broken. So
//     `CLAUDE.md` is gitignored, and this script is what puts it there.
//
// Running from `prepare` makes every generation path converge on the same two links, whether
// `vp create` made them, degit broke them, or nothing created them at all. This never replaces
// a real file or directory: a repo that deliberately keeps its own `CLAUDE.md` or `.claude/` is
// left alone and told so. Failure to link is reported, never thrown — a missing symlink is
// worth a warning, not a failed install.

import { lstatSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");

const LINKS: { link: string; target: string; type: "file" | "dir" }[] = [
  { link: "CLAUDE.md", target: "AGENTS.md", type: "file" },
  { link: ".claude", target: ".agents", type: "dir" },
];

const report = (message: string): void => {
  process.stderr.write(`link-agents: ${message}\n`);
};

for (const { link, target, type } of LINKS) {
  const linkPath = path.join(root, link);
  const existing = lstatSync(linkPath, { throwIfNoEntry: false });

  if (existing?.isSymbolicLink() === true) {
    if (readlinkSync(linkPath) === target) {
      continue;
    }
    unlinkSync(linkPath);
  } else if (existing !== undefined) {
    // Answering the `vp create` agent prompt with CLAUDE.md but not AGENTS.md lands here: it
    // writes a real file holding only the Vite+ block, so the house rules in AGENTS.md never
    // reach Claude Code. Deleting someone's real instructions to force a symlink is worse than
    // saying so, hence the remedy rather than a clobber.
    const kind = existing.isDirectory() ? "directory" : "file";
    report(
      `${link} is a real ${kind}, leaving it alone — delete it and reinstall to link it to ${target}`
    );
    continue;
  }

  try {
    symlinkSync(target, linkPath, type);
    report(`relinked ${link} -> ${target}`);
  } catch (error) {
    report(
      `could not link ${link} -> ${target}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
