---
name: rebaseline
description: Take upstream changes into files this repo copied and then edited, keeping the local edits. Covers baseline's changes in a repo generated from it, and upstream changes to vendored skills.
disable-model-invocation: true
---

# Rebaseline

This repo carries copies of other repos' files and edits them in place:

- **Baseline**: a repo generated from [baseline](https://github.com/ferntheplant/baseline) is a copy of all of it. `.baseline.jsonc` at its root records which baseline commit it last took. Baseline itself has no such file.
- **Vendored skills**: `.agents/vendored-skills.jsonc` records, for each skill copied from another repo, its source and the commit it was last merged from.

That recorded commit is the **base**. Rebaselining is a three-way merge: the upstream changes from the base to the newest upstream commit, applied on top of the local copy. A local edit survives unless upstream changed the same lines, and each manifest's comments say why each local edit was made, which is what decides a conflict.

## Pick the branch

| Argument | Branch |
| --- | --- |
| `init` | [Initialise](#initialise): record the base in a repo generated from baseline |
| none, with `.baseline.jsonc` present | [Merge](#merge) baseline's changes |
| `skills [<name>...]` | [Merge](#merge) upstream changes into every vendored skill, or only the named ones |
| `add <repo-url> <path> [<name>]` | [Add](#add) a vendored skill |

With no argument and no `.baseline.jsonc`, ask which branch was meant. In a repo generated from baseline, merge baseline before the skills: baseline already carries the upstream skill changes it has taken, so the skills branch is left with only what baseline has not.

## Before every branch

Start on a new branch from a clean working tree: `git apply --3way` writes to the index, and refuses a path with uncommitted changes.

**Fetch** each upstream into this repo's object store under a ref of its own, with full history, since the base is usually some commits back:

```bash
git fetch --no-tags <repo> +<ref>:refs/rebaseline/<source>
```

Baseline is `https://github.com/ferntheplant/baseline` at `main`, fetched as `refs/rebaseline/baseline`.

## Initialise

1. Fetch baseline.
2. Find the base with [`find-base.sh`](find-base.sh), passing each exclude from step 3 as a pathspec:

   ```bash
   .agents/skills/rebaseline/find-base.sh refs/rebaseline/baseline . . \
     ':(exclude)README.md' ':(exclude)ABSTRACT.md' ':(exclude)CONTEXT.md' \
     ':(exclude)apps/example' ':(exclude)pnpm-lock.yaml'
   ```

   The top line is the base. A repo generated today matches the newest commit almost file for file; an older or heavily edited one matches less, and the top line is still the closest state to merge from.

3. Write `.baseline.jsonc` with the base's full sha (`git rev-parse <short sha>`):

   ```jsonc
   // The baseline commit this repo last took, for `/rebaseline`. Each local edit to a file baseline
   // also owns gets a comment here saying what changed and why: the next rebaseline reads these to
   // decide which side of a conflict to keep.
   {
     "repo": "https://github.com/ferntheplant/baseline",
     "ref": "main",
     "base": "<full sha>",
     // Paths this repo owns outright, so baseline's changes to them are never taken. Add a path once
     // the repo replaces or deletes it. pnpm-lock.yaml is regenerated after each merge instead.
     "exclude": ["README.md", "ABSTRACT.md", "CONTEXT.md", "apps/example", "pnpm-lock.yaml"],
   }
   ```

4. List the files that already differ from the base (`git diff --stat <base> -- . <excludes>`) and ask the user which differences are deliberate. Write a comment for each deliberate one, then [Verify and hand off](#verify-and-hand-off).

**Done when** `.baseline.jsonc` holds a full sha and a comment for every deliberate difference.

## Merge

There is one **entry** to merge for baseline: source path `.`, local path `.`, plus its excludes. For skills, each entry in `.agents/vendored-skills.jsonc` is one: its source path is `path`, and its local path is `.agents/skills/<name>`. Fetch every source the entries name, then run steps 1 to 5 for each entry.

1. **Skip** an entry upstream has not touched since its base: `git diff --quiet <base> refs/rebaseline/<source> -- <path>`.
2. **Apply**:

   ```bash
   # a skill
   git diff --binary <base> refs/rebaseline/<source> --relative=<path> -- <path> |
     git apply --3way --directory=.agents/skills/<name>
   # baseline
   git diff --binary <base> refs/rebaseline/baseline -- . ':(exclude)<path>'... | git apply --3way
   ```

   Clean hunks land. Overlapping ones leave conflict markers, and `git status` lists their files as unmerged. When upstream deleted or renamed a file the repo also edited, `git apply` names the path and the hunk it could not place: that is a conflict too, resolved by hand. When `<path>` itself is gone upstream, the skill moved or was retired: find where it went with `git log -1 --stat refs/rebaseline/<source> -- <path>`, and ask the user before repointing `path`.

3. **Resolve** each conflict. Read upstream's reason (`git log <base>..refs/rebaseline/<source> -- <file>`) and the manifest comment on the local edit, then sort it:
   - **Minor**: both intents fit in one text. Write it: upstream's new content, with the local edit's intent kept.
   - **Major**: upstream rewrote, reversed, or removed what a local edit changed, or keeping both would change what the file does. Stop, and bring every major conflict to the user together. For each: the file, what upstream changed and why, what the local edit is and why, and your recommendation. Resolve them as the user decides.
   - A local edit with no comment is either undocumented or drift. `git log -p` on the file shows whether a commit made it on purpose: if one did, keep it as a local edit and comment it; otherwise take upstream's side.

4. **Review** what merged cleanly, too: `git diff --cached` per entry. A clean merge is only textual, and upstream's change can still clash with this repo, such as a renamed convention file or a command this repo runs differently. Treat each clash as a conflict, as in step 3.
5. **Record**: set `base` to the full sha of `refs/rebaseline/<source>`. Comment every local edit that resolving created or changed, and delete the comment on any edit that upstream made redundant.

**Done when** every entry is skipped or recorded, no file holds a conflict marker (`git diff --check`), and the user has decided every major conflict.

## Add

1. Fetch the source. If `sources` lacks it, add it with `repo`, `ref`, and `license`: the path of a copy of the upstream license, saved to `.agents/licenses/<source>.txt`.
2. Copy the skill at the fetched commit, as a merge from an empty base:

   ```bash
   git diff --binary "$(git hash-object -t tree /dev/null)" refs/rebaseline/<source> --relative=<path> -- <path> |
     git apply --index --directory=.agents/skills/<name>
   ```

3. Add its entry under `skills`, with `base` set to the fetched commit's full sha. When `<name>` differs from upstream's directory, set `name:` in its `SKILL.md` frontmatter to match, and comment that as a local edit.

## Verify and hand off

1. After a baseline merge, run `vp install`: it takes catalog changes and regenerates `pnpm-lock.yaml`.
2. Run `vp run ready:agent` until it prints `ready: ok`. A failure the merge caused belongs to the merge: fix it, judging it minor or major the same way.
3. Delete every ref fetched: `git update-ref -d refs/rebaseline/<source>`.
4. Commit: `chore: rebaseline onto baseline <short sha>`, `chore: rebaseline skills`, or `chore: vendor the <name> skill`.
5. Report, per entry: the upstream commits taken (one line each), the local edits kept, and each conflict with how it was resolved.
