import { effectNative, recommended } from "@effect/tsgo/oxlint-presets";
import oxfmt from "ultracite/oxfmt";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import vitest from "ultracite/oxlint/vitest";
import { defineConfig } from "vite-plus";

// Ultracite's list (dependencies, build output, generated code, lockfiles) plus the TanStack
// cache it does not know about. oxlint does not inherit `ignorePatterns` from `extends`, so both
// blocks name the list themselves.
const IGNORE_PATTERNS = [...(core.ignorePatterns ?? []), "**/.tanstack"];

// Packages written in Effect, held to Effect's lint presets: `recommended`, plus `effectNative`,
// which bans the platform escape hatches (`node:` imports, global `console`/`Date`/`process.env`,
// `JSON.parse` over Schema). Scoped rather than extended, because those rules would also flag the
// plain Node code elsewhere (scripts/, the workspace-conventions test). The rules need the Oxlint
// patch that `prepare` applies (BASELINE.md, _Effect_).
const EFFECT_PACKAGES = ["tools/ready-agent/**"];

// Ultracite's vitest preset, taught that @effect/vitest's `it.effect` and friends are test blocks
// too. A preset's own `overrides` beat this config's, so the rule is changed in the preset.
const NO_STANDALONE_EXPECT: [
  "error",
  { additionalTestBlockFunctions: string[] },
] = [
  "error",
  {
    additionalTestBlockFunctions: [
      "it.effect",
      "it.live",
      "it.flakyTest",
      "it.prop",
    ],
  },
];
const vitestWithEffect = {
  ...vitest,
  overrides: (vitest.overrides ?? []).map((override) => ({
    ...override,
    rules: {
      ...override.rules,
      "vitest/no-standalone-expect": NO_STANDALONE_EXPECT,
    },
  })),
};

export default defineConfig({
  fmt: {
    ...oxfmt,
    // Skills are vendored from other repos and edited in place (`.agents/vendored-skills.jsonc`).
    // Reformatting them would make every line the formatter touches a local edit, which then
    // conflicts with each upstream change to that line when `/rebaseline` merges it in.
    // Merge message templates are not Markdown: each line is a part of the commit message, and the
    // formatter would join them into one paragraph.
    // Blog posts are published writing, not source: the formatter would rewrite their prose and the
    // code samples in them, which changes what a reader sees on the site.
    ignorePatterns: [
      ...IGNORE_PATTERNS,
      ".agents/skills/**",
      ".forgejo/default_merge_message/**",
      "apps/site/src/blog/**",
    ],
  },
  lint: {
    // Ultracite's presets carry the rule set, and where they disagree with this block they win:
    // an `overrides` entry in an extended preset beats the same rule in this config's own
    // `overrides`. This block holds only what is particular to this repo. A project adds the
    // presets for what it uses; BASELINE.md's _Lint presets_ section lists them.
    // The site renders React components inside Astro and styles everything with Tailwind, so it
    // takes the `react` and `shadcn` presets (BASELINE.md, _Lint presets_). Ultracite's `astro`
    // preset is empty, so it is not listed.
    extends: [core, react, shadcn, vitestWithEffect, antiSlop],
    ignorePatterns: IGNORE_PATTERNS,
    // `jsPlugins` does not merge from an extended preset, so the shadcn plugin is named again here.
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      ...(shadcn.jsPlugins ?? []),
    ],
    options: {
      maxWarnings: 0,
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: EFFECT_PACKAGES,
        plugins: [
          ...(recommended.plugins ?? []),
          ...(effectNative.plugins ?? []),
        ],
        rules: {
          ...recommended.rules,
          ...effectNative.rules,
          // Effect v4 marks every platform module unstable (processes, files, paths, the Node
          // runtime, @effect/vitest), and there is no stable alternative to move to. The catalog
          // pins the Effect packages exactly instead, so a breaking change arrives as a reviewed
          // upgrade.
          "effecttsgo/unstable-api-usage": "off",
          // Ultracite rules that misread Effect code. `Effect.gen` and `Effect.fn` take anonymous
          // generators by convention, and `Effect.fn` names the span itself; Effect's API takes
          // callbacks and has no `await`; `Effect.forEach(items, f, options)` is not an array
          // method with a `thisArg`.
          "func-names": "off",
          "promise/prefer-await-to-callbacks": "off",
          "unicorn/no-array-method-this-argument": "off",
        },
      },
    ],
    rules: {
      // fallow already fails the gate on import cycles, across the whole workspace graph.
      "import/no-cycle": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/*"],
              message: "Use absolute imports (unless import is sibling)",
            },
          ],
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  logLevel: "error",
  root: ".",
  run: {
    cache: true,
    tasks: {
      // `vp run ready`, condensed for agents. A task rather than a script because it needs
      // `cache: false`: the gate it wraps caches per step already, and under script caching the
      // runner's file tracking makes the nested `vp run` fail to spawn (os error 22).
      "ready:agent": {
        cache: false,
        command: "node tools/ready-agent/src/main.ts",
      },
    },
  },
  staged: {
    // `--force-exclude` applies `_typos.toml`'s excludes to the file paths lint-staged passes in,
    // which typos otherwise checks unconditionally.
    "*": ["typos --force-exclude", "vp check --fix"],
  },
  test: {
    // Suites that stand up a real harness in `beforeAll` need the same margin as `testTimeout`.
    hookTimeout: 30_000,
    passWithNoTests: false,
    // Vitest's 5s default is smaller than the waits real suites declare (an SSE reader asking
    // for 10s, a process probe allowing 20s), so the generic "Test timed out in 5000ms" wins
    // over the assertion that would have said what actually broke. A budget must exceed the
    // longest wait a test can perform; passing tests never spend it.
    testTimeout: 30_000,
  },
});
