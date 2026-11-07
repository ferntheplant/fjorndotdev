import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, FileSystem, Option, Path } from "effect";
import { describe, expect } from "vite-plus/test";

import { condense, trim } from "./condense.ts";

// Gate output captured from a real run, kept beside this file.
const fixture = Effect.fn("fixture")(function* (name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(
    yield* path.fromFileUrl(new URL(`fixtures/${name}`, import.meta.url))
  );
}, Effect.provide(NodeServices.layer));

// The `-v` summary vp prints after the step output, built from `[n] key: command ✓|✗` rows.
const summary = (...rows: string[]): string =>
  [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "    Vite+ Task Runner • Execution Summary",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "Task Details:",
    "────────────────────────────────────────────────",
    ...rows.map((row, i) => `  [${i + 1}] ${row}`),
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");

// Two failed steps under one key, each printing `lines`.
const gate = (
  lines: string
): string => `[@x/a#ready] $ vp check ○ cache miss, executing
── [@x/a#ready] ──
${lines}
[@x/a#ready] $ vp lint ○ cache miss, executing
── [@x/a#ready] ──
${lines}
${summary("@x/a#ready: $ vp check ✗ (exit code: 1)", "@x/a#ready: $ vp lint ✗ (exit code: 1)")}`;

describe(condense, () => {
  it.effect(
    "keeps only the failing step, without separators or passing lines",
    () =>
      Effect.gen(function* () {
        const out =
          yield* condense(`[@baseline/root#ready] $ sherif ◉ cache hit, replaying
── [@baseline/root#ready] ──

✓ No issues found

[@baseline/root#ready] $ vp check ○ cache miss: 'broken.ts' added in 'apps/example/src', executing
── [@baseline/root#ready] ──
pass: All 33 files are correctly formatted (282ms, 10 threads)
× typescript(TS2322): Type 'string' is not assignable to type 'number'.
Found 1 error and 0 warnings in 6 files (309ms, 10 threads)

${summary("@baseline/root#ready: $ sherif ✓", "@baseline/root#ready: $ vp check ✗ (exit code: 1)")}`);

        expect(out).toBe(
          [
            "ready: failed at @baseline/root#ready: $ vp check",
            "× typescript(TS2322): Type 'string' is not assignable to type 'number'.",
            "Found 1 error and 0 warnings in 6 files (309ms, 10 threads)",
          ].join("\n")
        );
      })
  );

  // Captured from a real run: example's test failed; ready-agent's passed, then vp killed it
  // (exit 137). Both headers print before either block, and blocks arrive in finishing order.
  it.effect(
    "files parallel output by separator and reports a killed sibling as stopped",
    () =>
      Effect.gen(function* () {
        const out = yield* condense(
          yield* fixture("parallel-test-failure.txt")
        );

        expect(out.split("\n")[0]).toBe(
          "ready: failed at @baseline/example#test: ~/apps/example$ vp test run --reporter=minimal"
        );
        expect(out).toContain(
          "AssertionError: expected 'Hello, world!' to be 'Hello, moon!'"
        );
        expect(out).not.toContain("Tests  9 passed");
        expect(out.split("\n").at(-1)).toBe(
          "ready: stopped early, result unknown: @baseline/ready-agent#test: ~/tools/ready-agent$ vp test run --reporter=minimal"
        );
      })
  );

  it.effect(
    "reports a killed step as the failure when nothing else failed",
    () =>
      Effect.gen(function* () {
        const out =
          yield* condense(`[@x/a#test] ~/a$ vp test run ○ cache miss, executing
── [@x/a#test] ──
out of memory
${summary("@x/a#test: ~/a$ vp test run ✗ (exit code: 137)")}`);

        expect(out).toBe(
          "ready: failed at @x/a#test: ~/a$ vp test run\nout of memory"
        );
      })
  );

  it.effect("matches a failed command exactly, not by prefix", () =>
    Effect.gen(function* () {
      const out =
        yield* condense(`[@x/a#ready] $ vp build:x ◉ cache hit, replaying
── [@x/a#ready] ──
build:x ok
[@x/a#ready] $ vp build ○ cache miss, executing
── [@x/a#ready] ──
build broke
${summary("@x/a#ready: $ vp build:x ✓", "@x/a#ready: $ vp build ✗ (exit code: 1)")}`);

      expect(out).toBe("ready: failed at @x/a#ready: $ vp build\nbuild broke");
    })
  );

  it.effect("pairs a repeated command with the run that failed", () =>
    Effect.gen(function* () {
      const out =
        yield* condense(`[@x/a#ready] $ vp check ○ cache miss, executing
── [@x/a#ready] ──
first run clean
[@x/a#ready] $ vp check ○ cache miss, executing
── [@x/a#ready] ──
second run broke
${summary("@x/a#ready: $ vp check ✓", "@x/a#ready: $ vp check ✗ (exit code: 1)")}`);

      expect(out).toBe(
        "ready: failed at @x/a#ready: $ vp check\nsecond run broke"
      );
    })
  );

  it.effect(
    "saves the full output once, and only when a block is trimmed",
    () =>
      Effect.gen(function* () {
        const long = Array.from({ length: 200 }, (_, i) => `error ${i}`).join(
          "\n"
        );
        let saves = 0;
        const save = Effect.sync(() => {
          saves += 1;
          return Option.some("full.log");
        });

        expect(yield* condense(gate("one error"), save)).not.toContain(
          "full.log"
        );
        expect(saves).toBe(0);

        const out = yield* condense(gate(long), save);
        expect(out.match(/full output: full\.log/gu)).toHaveLength(2);
        expect(saves).toBe(1);
      })
  );

  it.effect(
    "falls back to the end of the raw output when there is no summary",
    () =>
      Effect.gen(function* () {
        const out = yield* condense(
          "error: Failed to find executable typos under cwd /repo"
        );

        expect(out).toBe(
          "ready: failed\nerror: Failed to find executable typos under cwd /repo"
        );
      })
  );
});

describe(trim, () => {
  it.effect("drops blank lines and keeps short output whole", () =>
    Effect.gen(function* () {
      expect(yield* trim(["a", "", "  ", "b"])).toStrictEqual(["a", "b"]);
    })
  );

  it.effect(
    "keeps head and tail of long output around an omission marker",
    () =>
      Effect.gen(function* () {
        const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);

        expect(yield* trim(lines, { max: 10 })).toStrictEqual([
          ...lines.slice(0, 7),
          "… 10 lines omitted …",
          ...lines.slice(17),
        ]);
      })
  );

  it.effect("points the omission marker at the saved full output", () =>
    Effect.gen(function* () {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);

      const trimmed = yield* trim(lines, {
        max: 10,
        save: Effect.succeedSome("node_modules/.cache/ready-agent/run.log"),
      });

      expect(trimmed[7]).toBe(
        "… 10 lines omitted; full output: node_modules/.cache/ready-agent/run.log …"
      );
    })
  );
});
