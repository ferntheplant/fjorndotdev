import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { DateTime, Effect, FileSystem, Option, Path } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect } from "vite-plus/test";

import { saveFullOutput } from "./full-output.ts";

const at = (iso: string): Effect.Effect<void> =>
  TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(iso)));

// A fresh directory standing in for the repo root, removed when the test's scope closes.
const scratch = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "ready-agent-" });
  return {
    cache: path.join(root, "node_modules", ".cache", "ready-agent"),
    fs,
    path,
    root,
  };
});

// Seeds the cache with older saved outputs, one per minute after 01:00.
const seed = Effect.fn("seed")(function* (
  minutes: readonly number[],
  extra: readonly string[] = []
) {
  const { cache, fs, path, root } = yield* scratch;
  yield* fs.makeDirectory(cache, { recursive: true });
  yield* Effect.forEach(
    [...minutes.map((minute) => `2026-09-30T01-${minute}-00-1.log`), ...extra],
    (name) => fs.writeFileString(path.join(cache, name), "")
  );
  return { cache, fs, path, root };
});

describe(saveFullOutput, () => {
  it.effect(
    "writes one file per run under node_modules/.cache and returns its path from the root",
    () =>
      Effect.gen(function* () {
        const { fs, path, root } = yield* scratch;
        yield* at("2026-09-30T01:40:12.345Z");

        const first = yield* saveFullOutput(root, "first run", 11);
        const second = yield* saveFullOutput(root, "second run", 12);

        expect(first).toStrictEqual(
          Option.some(
            "node_modules/.cache/ready-agent/2026-09-30T01-40-12-11.log"
          )
        );
        expect(second).toStrictEqual(
          Option.some(
            "node_modules/.cache/ready-agent/2026-09-30T01-40-12-12.log"
          )
        );
        expect(
          yield* fs.readFileString(path.join(root, Option.getOrThrow(first)))
        ).toBe("first run");
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "keeps only the newest saved outputs, and leaves other files alone",
    () =>
      Effect.gen(function* () {
        const { cache, fs, root } = yield* seed([10, 11, 12], ["notes.txt"]);
        yield* at("2026-09-30T01:13:00.000Z");

        const saved = yield* saveFullOutput(root, "newest", 2, 2);

        expect(saved).toStrictEqual(
          Option.some(
            "node_modules/.cache/ready-agent/2026-09-30T01-13-00-2.log"
          )
        );
        expect((yield* fs.readDirectory(cache)).toSorted()).toStrictEqual([
          "2026-09-30T01-12-00-1.log",
          "2026-09-30T01-13-00-2.log",
          "notes.txt",
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "never prunes the file this run wrote, even when it sorts oldest",
    () =>
      Effect.gen(function* () {
        const { cache, fs, path, root } = yield* seed([10, 11, 12]);
        // The clock stepped back: this run's name sorts before every existing file.
        yield* at("2026-09-30T01:00:00.000Z");

        const saved = yield* saveFullOutput(root, "stepped back", 2, 2);

        expect(saved).toStrictEqual(
          Option.some(
            "node_modules/.cache/ready-agent/2026-09-30T01-00-00-2.log"
          )
        );
        expect(
          yield* fs.readFileString(path.join(root, Option.getOrThrow(saved)))
        ).toBe("stepped back");
        expect((yield* fs.readDirectory(cache)).toSorted()).toStrictEqual([
          "2026-09-30T01-00-00-2.log",
          "2026-09-30T01-12-00-1.log",
        ]);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("returns no path when the file cannot be written", () =>
    Effect.gen(function* () {
      const { fs, path, root } = yield* scratch;
      // A file where the cache directory should go makes mkdir fail.
      yield* fs.writeFileString(path.join(root, "node_modules"), "");

      expect(yield* saveFullOutput(root, "output", 1)).toStrictEqual(
        Option.none()
      );
    }).pipe(Effect.provide(NodeServices.layer))
  );
});
