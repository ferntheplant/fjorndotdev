# fjorndotdev

The source of [fjorn.dev](https://fjorn.dev): an [Astro](https://astro.build) site in `apps/site`, deployed to Cloudflare Workers with [Alchemy](https://alchemy.run).

| Read                           | For                                   |
| ------------------------------ | ------------------------------------- |
| [`ABSTRACT.md`](./ABSTRACT.md) | What the site is, and what it is not  |
| [`CONTEXT.md`](./CONTEXT.md)   | What the project's words mean         |
| [`BASELINE.md`](./BASELINE.md) | The toolchain, and the one-time setup |
| [`AGENTS.md`](./AGENTS.md)     | House rules for humans and agents     |

## Setup

The toolchain comes from the [baseline](https://github.com/ferntheplant/baseline) template: Vite+ for Node, pnpm, and the JavaScript tooling, and mise for gitleaks and typos. [`BASELINE.md`](./BASELINE.md) covers the one-time machine setup. [`.baseline.jsonc`](./.baseline.jsonc) records the baseline commit this repo last took; `/rebaseline` takes baseline's later changes.

```bash
vp env on          # once per machine, if you ever ran `vp env off`
mise trust && mise install
vp install
```

## Daily commands

```bash
vp run -r --parallel dev                    # the site at http://localhost:4321
vp run ready                                # the gate: typos, vp check, sherif, tests, builds, fallow
vp run ready:agent                          # the same gate for agents
vp check --fix                              # format + autofix lint
vp run --filter @fjorndotdev/site preview:astro   # serve the last build
vp run --filter @fjorndotdev/site preview:cf      # serve the site in workerd, as Cloudflare does
```

`vp check` does not format `.astro` files or blog posts: Oxfmt has no Astro support, and posts are published writing (`vite.config.ts` says why). The gate type-checks `.astro` files with `astro check`, from [`tools/astro-check`](./tools/astro-check/).

## Adding a good link

```bash
vp run --filter @fjorndotdev/site good:add "<url>"
```

It fetches the page title, guesses the type from the host, asks you to confirm both, and prepends the entry to `apps/site/src/data/good.yaml`. `--help` lists the flags; `--yes` skips the questions.

## Deploying

A push to `main` deploys the site: [`.forgejo/workflows/deploy.yml`](./.forgejo/workflows/deploy.yml) runs the gate, then `alchemy deploy --stage prod` from `apps/site`. [`apps/site/alchemy.run.ts`](./apps/site/alchemy.run.ts) defines the Cloudflare resources, and Alchemy keeps its state in Cloudflare.

The workflow needs two Actions secrets on the Forgejo repo, under **Settings → Actions → Secrets**:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token that can edit Workers and the `fjorn.dev` zone's DNS.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns the zone.

To deploy from your machine, export both variables, then run `vp run --filter @fjorndotdev/site deploy:prod`. Run **Actions → Deploy → Run workflow** to deploy `main` again without a new commit.

The repository settings that cannot be committed (a protected `main`, squash merges, the dependency-bump token) are in [`BASELINE.md`](./BASELINE.md#manual-forgejo-settings).
