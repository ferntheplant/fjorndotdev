import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vite-plus/test";

import { run } from "./run.ts";

// A real child process stands in for `vp`, so these exercise the same spawning path as the gate.
const SCRIPT = [
  String.raw`process.stdout.write("\u001B[31mred\u001B[0m\n");`,
  String.raw`process.stderr.write("err\n");`,
  "process.exitCode = 3;",
].join(" ");

describe(run, () => {
  it.effect(
    "joins stdout and stderr, strips colour codes, and keeps the exit status",
    () =>
      Effect.gen(function* () {
        const result = yield* run("node", ["-e", SCRIPT]);

        expect(result).toStrictEqual({ output: "red\nerr\n", status: 3 });
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "reports why the command could not start, with a failing status",
    () =>
      Effect.gen(function* () {
        const result = yield* run("ready-agent-no-such-command", [
          "run",
          "ready",
        ]);

        expect(result.status).toBe(1);
        expect(result.output).toMatch(
          /^ready-agent: could not run ready-agent-no-such-command run ready: .+\n$/u
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );
});
