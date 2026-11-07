// `vp run ready`, condensed for an agent's context window: one line on success, and on failure
// only the output of the steps that failed (see `condense.ts`). It wraps the real gate rather
// than restating it, so the `ready` script in the root package.json stays the single list of
// what the gate runs, and every step keeps its cache.

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Data, Effect, Runtime } from "effect";

import { condense } from "./condense.ts";
import { saveFullOutput } from "./full-output.ts";
import { run } from "./run.ts";

// The gate failed and the condensed report has been printed. `runMain` exits with the gate's own
// status, and skips its error log: the report already says what failed.
class GateFailed extends Data.TaggedError("GateFailed")<{
  readonly status: number;
}> {
  readonly [Runtime.errorExitCode] = this.status;
  readonly [Runtime.errorReported] = false;
}

const main = Effect.gen(function* () {
  // `-v` appends the per-step ✓/✗ summary to this run's own output, which `condense` reads.
  const gate = yield* run("vp", ["run", "-v", "--log", "grouped", "ready"]);
  if (gate.status === 0) {
    return yield* Console.log("ready: ok");
  }
  yield* Console.log(
    yield* condense(
      gate.output,
      saveFullOutput(process.cwd(), gate.output, process.pid)
    )
  );
  return yield* new GateFailed({ status: gate.status });
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
