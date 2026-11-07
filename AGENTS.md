# fjorndotdev

## Where things live

| If you need                            | Read                           |
| -------------------------------------- | ------------------------------ |
| What this project is                   | [`ABSTRACT.md`](./ABSTRACT.md) |
| What a word means                      | [`CONTEXT.md`](./CONTEXT.md)   |
| How to run, deploy, or add a good link | [`README.md`](./README.md)     |

New writing goes to one of those homes from the start, and **nothing lives in two of them**.

## House rules

- **Conventional Commits, always**, for commits and PR titles alike. The allowed types are in [`commitlint.config.ts`](./commitlint.config.ts).
- **`vp` is the toolchain.** `vp <name>` runs a built-in and `vp run <name>` a `package.json` script or `vite.config.ts` task; `vp help` lists the built-ins, and the docs are in `node_modules/vite-plus/docs`.
- **`vp run ready:agent` is the gate.** It prints `ready: ok`, or only the output of the steps that failed. When a step's output is trimmed, the `lines omitted` marker names the file holding all of it; read it when the trimmed part matters.
- **Packages share three script verbs: `test` in every package, `build` in packages that ship or deploy, and `dev`.** Only these fan out: run dev servers with `vp run -r --parallel dev`, since they never exit. Anything else is namespaced (`db:migrate`) and run with `--filter`. [`tools/workspace-conventions`](./tools/workspace-conventions/) enforces the names and says why.
- **Internal packages export source.** `exports` points at `./src/index.ts`, because the gate type-checks and tests before it builds. A package published to npm overrides `exports` under `publishConfig` with its `dist` entries.
- **A command is a `package.json` script unless it needs what only a task has.** `run.cache: true` already caches scripts, step by step. Define a `vite.config.ts` task only for `cache: false` (a dev server, a watcher), `dependsOn`, or `cache.env` / `cache.input`, and name it like a script.
- **Lint rules change in `vite.config.ts`, with a comment saying why**, never by an inline suppression. A change that brings in a framework (React, Tailwind, TanStack, …) adds its Ultracite preset to `lint.extends` in the same change; [`BASELINE.md`](./BASELINE.md)'s _Lint presets_ section lists them.
- **Dependencies live in the catalog in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml)**, at exact versions, and packages depend on `catalog:`. One that must be upgraded by hand goes in `updateConfig.ignoreDependencies` there, with a comment saying why.
- **A gitleaks false positive goes in `.gitleaksignore`** by fingerprint.
- **A word typos wrongly flags goes in [`_typos.toml`](./_typos.toml)**, with a comment saying what it is.
- **An edit to a copied file comments its manifest entry**, saying what changed and why. The copies are the skills in [`.agents/vendored-skills.jsonc`](./.agents/vendored-skills.jsonc) and, in a repo generated from baseline, every file `.baseline.jsonc` covers; `/rebaseline` settles merge conflicts by those comments.
- **Code fallow reports as unreachable gets deleted.** Only a file reached solely at runtime goes in [`fallow.toml`](./fallow.toml) instead.

## Definition of done

A change is done when its production path is reachable through a real entrypoint; success and expected failure are tested; `vp run ready:agent` passes from a clean checkout; and the documentation is updated where implementation invalidated an assumption — a new term means a `CONTEXT.md` entry, and a change in what the project is or is not means an `ABSTRACT.md` edit.
