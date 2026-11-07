import { stripVTControlCharacters } from "node:util";

import { Effect, Stream } from "effect";
import { ChildProcess } from "effect/process";

interface RunResult {
  readonly status: number;
  readonly output: string;
}

// Ask tools not to colour their output; `run` strips whatever they emit anyway.
const NO_COLOUR = { FORCE_COLOR: "0", NO_COLOR: "1" };

const text = <E>(
  stream: Stream.Stream<Uint8Array, E>
): Effect.Effect<string, E> =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

// One exit status and one block of text from a finished process: stdout, then stderr. Colour
// codes waste tokens and break the condenser's header matching, so they go. When the process
// cannot start (not on PATH), there is no output to parse; the error is the only explanation,
// and the condenser's fallback shows it.
export const run = Effect.fn("run")(
  function* (command: string, args: readonly string[]) {
    const handle = yield* ChildProcess.make(command, args, {
      env: NO_COLOUR,
      extendEnv: true,
    });
    const [stdout, stderr, status] = yield* Effect.all(
      [text(handle.stdout), text(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" }
    );
    const result: RunResult = {
      output: stripVTControlCharacters(`${stdout}${stderr}`),
      status,
    };
    return result;
  },
  Effect.scoped,
  (effect, command, args) =>
    Effect.catchTag(effect, "PlatformError", (error) =>
      Effect.succeed<RunResult>({
        output: `ready-agent: could not run ${[command, ...args].join(" ")}: ${error.message}\n`,
        status: 1,
      })
    )
);
