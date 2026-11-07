# Baseline

This repo's toolchain comes from [baseline](https://github.com/ferntheplant/baseline): what each piece is, how to work with it, and why it is set up this way. The file belongs to baseline, and `/rebaseline` keeps it current; the project's own documentation goes in `README.md`.

## What's in the box

| File | What it settles |
| --- | --- |
| [`vite.config.ts`](./vite.config.ts) | Oxlint and Oxfmt from Ultracite's presets (see [Lint presets](#lint-presets)), staged-file checks, Vitest defaults |
| [`tsconfig.json`](./tsconfig.json) | Strict TypeScript, bundler resolution, no implicit `any`, no unchecked index access |
| [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) | Workspace globs, the dependency catalog at exact versions, and what upgrades by hand; see [Dependency versions](#dependency-versions) |
| [`commitlint.config.ts`](./commitlint.config.ts) | Conventional Commits, with the allowed type list |
| [`.forgejo/workflows/ci.yml`](./.forgejo/workflows/ci.yml) | CI; see [What runs where](#what-runs-where) |
| [`.forgejo/workflows/dependency-bumps.yml`](./.forgejo/workflows/dependency-bumps.yml) | A weekly PR bumping minor and patch versions; see [Dependency versions](#dependency-versions) |
| [`.forgejo/default_merge_message/SQUASH_TEMPLATE.md`](./.forgejo/default_merge_message/SQUASH_TEMPLATE.md) | The squash commit's message; see [Manual Forgejo settings](#3-squash-merge-only-with-the-prs-title-and-description) |
| [`fallow.toml`](./fallow.toml) | Dead-code, duplication, and complexity analysis |
| `sherif` in [`package.json`](./package.json) | Monorepo `package.json` lint: consistent versions, private root, no empty fields. Every warning fails; only `non-existant-packages` is ignored, because `packages/*` is declared before anything lives there |
| [`mise.toml`](./mise.toml) | The tools Vite+ does not provide, installed by mise |
| [`.node-version`](./.node-version) | The Node version Vite+ and CI install; keep it inside `engines.node` in `package.json` |
| [`_typos.toml`](./_typos.toml) | Spell-check exceptions |
| [`.vite-hooks/`](./.vite-hooks/) | Git hooks; see [What runs where](#what-runs-where) |
| [`ABSTRACT.md`](./ABSTRACT.md), [`CONTEXT.md`](./CONTEXT.md) | What the project is, and what its words mean |
| [`AGENTS.md`](./AGENTS.md) | Agent instructions, with `CLAUDE.md` symlinked to it |
| [`tools/ready-agent/`](./tools/ready-agent/) | `vp run ready:agent`: the gate condensed for agents, written in Effect v4 — keep it |
| [`tools/workspace-conventions/`](./tools/workspace-conventions/) | Tests that hold every package to the shared script names, and every version to an exact pin — keep it |
| [`.agents/skills/`](./.agents/skills/) | Agent skills, with `.claude/` symlinked to `.agents/` |
| [`.agents/vendored-skills.jsonc`](./.agents/vendored-skills.jsonc) | Where each copied skill came from and what was changed locally; see [Taking upstream changes](#taking-upstream-changes) |

`prepare` runs on install, so the git hooks install themselves and the agent symlinks repair themselves on the first `vp install`. The `CLAUDE.md` and `.claude/` symlinks are made by [`scripts/link-agents.ts`](./scripts/link-agents.ts) rather than committed, and its header says why; if agent instructions ever go missing, look there.

## Prerequisites

Install [Vite+](https://viteplus.dev/guide/) and [mise](https://mise.jdx.dev/getting-started.html), and activate mise in your shell as its guide describes, so the tools it installs are on your `PATH`.

Vite+ owns Node and pnpm: it installs the Node in `.node-version` and the pnpm in `devEngines` in `package.json`. Managed mode is its default; if you have switched it off (`vp env off`), switch it back on once per machine, or a Node or pnpm installed some other way wins over the pinned ones:

```bash
vp env on
```

[`mise.toml`](./mise.toml) disables Node and pnpm in the repo, so a version in your global mise config cannot shadow Vite+'s.

In each clone, install the tools [`mise.toml`](./mise.toml) names; the pre-commit hook refuses to commit until gitleaks and typos are installed:

```bash
mise trust && mise install
```

## Daily commands

```bash
vp run ready       # the gate; see What runs where
vp run ready:agent # the same gate for agents: `ready: ok`, or only the failing steps' output
vp check --fix     # format + autofix lint
vp test            # run tests
vp exec fallow     # dead code, duplication, complexity
```

## What runs where

| Check | git hooks | `vp run ready` | CI |
| --- | --- | --- | --- |
| gitleaks | staged changes |  | every commit |
| typos | staged files | whole repo | whole repo, as ready |
| `vp check` (format, lint, type-check) | staged, `--fix` | whole repo | whole repo, as ready |
| sherif |  | whole repo | whole repo, as ready |
| every package's `test` and `build` |  | yes | yes, as ready |
| fallow |  | whole repo | whole repo, as ready |
| commitlint | `commit-msg` |  | each PR commit, and the PR title |

CI runs `vp run ready` in full, so every check in the gate runs there too. The git hooks keep to what finishes in seconds on the staged files; sherif, tests, builds, and fallow need the whole workspace, so they wait for `ready`. gitleaks is the one check CI runs outside `ready`: it scans every commit on the branch, not the working tree, which catches a secret committed with `--no-verify` and later deleted.

## Lint presets

The lint rules and format style come from [Ultracite](https://www.ultracite.ai/)'s Oxlint and Oxfmt presets, which [`vite.config.ts`](./vite.config.ts) extends: `core` for TypeScript, `vitest` for test files, and `anti-slop`, a vendored copy of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) that rejects low-evidence patterns (unjustified type assertions, `unknown` leaking through signatures, `typeof` checks outside a type guard, module mocking). The `lint` block itself holds only what is particular to this repo: absolute imports, Vite+ imports, and import cycles left to fallow. Where a preset and that block disagree, the preset wins: an `overrides` entry in an extended preset beats the same rule in the block's own `overrides`.

Everything framework-specific is opt-in, so a project adds the presets for what it actually uses to `lint.extends`:

| Project uses | Add to `extends` | Also needs |
| --- | --- | --- |
| React | `react` from `ultracite/oxlint/react` | nothing |
| Next.js | `react`, and `next` from `ultracite/oxlint/next` | nothing |
| TanStack Router or Start | `react`, and `tanstack` from `ultracite/oxlint/tanstack` | nothing |
| Tailwind, in any app, package, or tool | `shadcn` from `ultracite/oxlint/shadcn` | `@shadcn/lint` installed; the preset's header covers its settings |
| Effect | nothing: depend on `effect` and add the package's glob to `EFFECT_PACKAGES` in `vite.config.ts` | already set up for `tools/ready-agent`; see [Effect](#effect) |

The `shadcn` preset is not shadcn/ui-specific: [@shadcn/lint](https://github.com/shadcn-ui/lint) checks class names against the project's own Tailwind v4 theme and component variants, and rejects raw colours, arbitrary values, inline styles, and restyled components. Its `settings` and `jsPlugins` do not merge from an extended config, so the preset's header says what to repeat in `vite.config.ts`.

Ultracite has presets for other frameworks too (Vue, Svelte, Astro, Angular, and more); the [`ultracite/oxlint/*` exports](https://github.com/haydenbleasel/ultracite/tree/main/packages/cli/config/oxlint) list them, each with a header saying what it needs.

Ultracite lists every rule by name, so a preset that names a rule the bundled Oxlint lacks fails to load the whole config (`Rule '…' not found in plugin '…'`). The weekly dependency bump holds `ultracite` back for that reason: upgrade it together with `vite-plus`, and check `vp toolchain oxlint` against the Oxlint range in Ultracite's `peerDependencies`.

### Effect

[`tools/ready-agent`](./tools/ready-agent/) is written in Effect v4, so the template ships Effect's lint rules already wired up. They run inside Oxlint's type-aware pass, through a build of Oxlint and tsgolint that [`@effect/tsgo`](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md) swaps in for the ones Vite+ installed. `prepare` applies that patch on every install (`effect-tsgo patch --no-typescript --oxlint`, as [Ultracite's Effect guide](https://www.ultracite.ai/docs/configuration#effect-oxlint) sets it up). It patches only Oxlint: the gate type-checks through tsgolint, so TypeScript's own `tsc` stays stock. Unpatched, Oxlint rejects the whole config with `Unknown plugin: 'effecttsgo'`; an install with nothing new to install skips `prepare`, so after pulling this setup into an existing checkout run `pnpm run prepare` once.

The rules apply only to the packages listed in `EFFECT_PACKAGES` in [`vite.config.ts`](./vite.config.ts), whose comment says what they ban and why they are scoped. To write another package in Effect, add its glob there. The same override turns off the few Ultracite rules that misread Effect code, with a comment on each.

Effect's fixes are reported as suggestions, so `vp check --fix` does not apply them; the diagnostic says what to change. For Effect diagnostics in the editor, `effect-tsgo setup` installs the Effect language service; then set `"diagnostics": false` on its `@effect/language-service` plugin entry in `tsconfig.json`, so each diagnostic is reported once, by Oxlint.

The patch renames the original binaries to `*.original` beside the replacements, so pnpm's shared store is untouched, and `effect-tsgo unpatch --oxlint` restores them. Each `@effect/tsgo` release supports a fixed list of Oxlint versions (the _Supported Package Versions_ table in its README), so the weekly dependency bump holds it back, and it is a third package to check before upgrading `vite-plus`. The Effect packages themselves do take the weekly bump, but v4's platform modules are unstable APIs that may change between versions, so read the changelog on an Effect bump even when CI passes.

## Dependency versions

Every version the workspace names is exact and lives in the catalog in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml); packages depend on `catalog:`. [`tools/workspace-conventions`](./tools/workspace-conventions/) fails the gate otherwise, and says why. An upgrade is therefore always a diff in the catalog.

Those diffs come from [`dependency-bumps.yml`](./.forgejo/workflows/dependency-bumps.yml). Every Monday it runs [taze](https://github.com/antfu-collective/taze) over the workspace, bumps every catalog entry to its newest minor or patch release that is at least a week old, and opens one PR on the `deps/weekly-bumps` branch, or updates it if one is already open. CI runs the full gate on it. The PR body lists what is still behind: majors, and a new Vite+ release, if there is one. The actions the workflows use are bumped by hand. To run the same bump locally:

```bash
vp exec taze minor --recursive --include-locked --maturity-period 7 --write && vp install
```

Some dependencies are upgraded by hand, because they have to move together with the Oxlint that `vite-plus` bundles. They are listed under `updateConfig.ignoreDependencies` in `pnpm-workspace.yaml`, with a comment saying why, and both taze and `vp update` skip them. The week-old cooldown is the workflow's `--maturity-period 7`, and its comment says why it is there rather than in pnpm's `minimumReleaseAge`.

## Taking upstream changes

Some files here are copies of files maintained somewhere else, edited in place: the skills in `.agents/skills/` that came from other repos, and, in a repo generated from baseline, every file baseline owns. Each copy records its [**base**](./CONTEXT.md), the upstream commit it was last merged from. `/rebaseline`, the [`rebaseline`](./.agents/skills/rebaseline/SKILL.md) skill, takes upstream changes as a three-way merge from that base, so a local edit survives unless upstream changed the same lines:

```text
/rebaseline              # in a generated repo: take baseline's changes since .baseline.jsonc's base
/rebaseline skills       # take upstream changes into every skill in .agents/vendored-skills.jsonc
/rebaseline add <repo> <path>   # copy in a new skill and record it
```

Where both sides changed the same lines, the agent decides using the comment that explains each local edit in the manifest, and it brings conflicts it can't settle that way to you. So an edit to a copied file also gets a comment on its manifest entry saying why; an edit with no comment looks like drift, and the next merge may take upstream's version over it.

Each source's license is copied to [`.agents/licenses/`](./.agents/licenses/).

## Manual Forgejo settings

The repo lives on [Forgejo](https://forgejo.org/), and CI runs there on Forgejo Actions. A GitHub copy, if there is one, is a read-only mirror of the Forgejo repo and needs none of this.

CI needs a runner with the `ubuntu-latest` label, in an image with git, curl, python3, and Node, and an instance whose `DEFAULT_ACTIONS_URL` is `https://github.com`, since the workflows name their actions as GitHub does (`actions/checkout@v7`).

Four things live in repository settings rather than in this repo, so they have to be set once per repo after publishing.

### 1. Protect `main`

**Settings → Branches → Add new rule**

- **Protected branch name pattern**: `main`
- **Push**: **Disable push**, so every change reaches `main` through a PR. A protected branch also refuses force pushes and deletion.
- **Required approvals**: `0` if you work solo, and check **Dismiss stale approvals**
- **Enable status check**, with the pattern **`CI / validate (pull_request)`**: the workflow's name, the job id in [`ci.yml`](./.forgejo/workflows/ci.yml), and the event. It only appears in the list after CI has run on a PR at least once, so push a first PR before adding it.
- **Block merge if pull request is outdated**

### 2. Delete the branch when a PR merges

**Settings → Repository → Pull requests**: check **Delete pull request branch after merge by default**.

### 3. Squash-merge only, with the PR's title and description

On the same page, uncheck every merge style except **Create squash commit**, and make it the **Default merge style**.

Squash-only merging keeps `main`'s history linear. The squash commit takes the PR title as its subject and the PR description as its body, so the description is what `main`'s history records about the change. That message comes from [`SQUASH_TEMPLATE.md`](./.forgejo/default_merge_message/SQUASH_TEMPLATE.md); without it, Forgejo's default body is only a `Reviewed-on:` link to the PR.

### 4. Give the dependency bump a token

Forgejo starts no workflow for a change made with the workflow's own token, so the weekly bump PR would never get CI. The workflow pushes and opens it with a token you provide instead, and fails with a message naming this section until there is one.

Make a bot user for it; a site admin can, with `forgejo admin user create`. Give the bot **Write** access under the repo's **Settings → Collaborators**, then make it an access token with **repository** set to read and write and **user** set to read; the workflow reads the bot's name and email from the token for the commit. Save the token as an Actions secret named `BUMP_BOT_TOKEN`, under the repo's **Settings → Actions → Secrets**, or under your user's settings to share it with every repo you own.

Then run **Actions → Dependency bumps → Run workflow** once to check it works.
