# astro-check

Type-checks the site's `.astro` files with [`astro check`](https://docs.astro.build/en/reference/cli-reference/#astro-check), as this package's `test`, so the gate runs it. `vp check` type-checks `.ts` and `.tsx` files only.

The check is its own package because of its TypeScript. `@astrojs/check` and its Volar language server load TypeScript's JavaScript API, which TypeScript 7 does not have, so this package takes TypeScript 6 from the `astro-check` catalog in `pnpm-workspace.yaml`. If `apps/site` depended on `@astrojs/check` itself, pnpm would install a second copy of `vite-plus` for the site, resolved against TypeScript 6 and Volar. The gate's `vp run -r test` then runs the site's tests on the root copy while the test files import the site's copy, and every test file fails to load.

Delete this package, and move `@astrojs/check` back into `apps/site`, once `@astrojs/check` supports TypeScript 7.
