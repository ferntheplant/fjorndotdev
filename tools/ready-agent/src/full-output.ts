import { DateTime, Effect, FileSystem, Option, Path } from "effect";

// Saves a failed gate's full output where the agent can read it when the condensed report had
// to omit lines. One file per run, named by time and process id, so concurrent gates (several
// subagents in one checkout) never overwrite each other's. `node_modules/.cache` is gitignored
// and is where tools conventionally keep throwaway state.

// How many saved outputs to keep. Each is one failed run; older ones have long been read or
// forgotten, and without a cap the directory grows until `node_modules` is reinstalled.
const KEEP = 100;

// `2026-09-30T01-40-12-4821.log`: the timestamp leads, so name order is roughly age order. Only
// roughly: it is whole seconds, pids within a second compare as text, and clocks step back.
const SAVED = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+\.log$/u;

// Deletes the oldest saved outputs, never `own`: the file this run just wrote and is about to
// name in its report, which would otherwise be deleted whenever it sorts first.
const prune = Effect.fn("prune")(function* (
  dir: string,
  own: string,
  keep: number
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const others = (yield* fs.readDirectory(dir))
    .filter((name) => SAVED.test(name) && name !== own)
    .toSorted();
  const excess = Math.max(0, others.length - (keep - 1));
  // `force`: a concurrent run pruning the same directory may have removed the file already.
  yield* Effect.forEach(
    others.slice(0, excess),
    (name) => fs.remove(path.join(dir, name), { force: true }),
    {
      discard: true,
    }
  );
});

// The saved file's path from `root`, or none when it could not be written: a report without the
// path beats no report, and the marker still says lines were omitted.
export const saveFullOutput = Effect.fn("saveFullOutput")(function* (
  root: string,
  output: string,
  pid: number,
  keep: number = KEEP
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const now = yield* DateTime.now;
  const dir = path.join(root, "node_modules", ".cache", "ready-agent");
  const name = `${DateTime.formatIso(now)
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/u, "")}-${pid}.log`;
  const file = path.join(dir, name);

  const written = yield* fs.makeDirectory(dir, { recursive: true }).pipe(
    Effect.andThen(fs.writeFileString(file, output)),
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  );
  if (!written) {
    return Option.none<string>();
  }
  // The file this run needs is written; a failed cleanup only postpones pruning to next time.
  yield* Effect.ignore(prune(dir, name, keep));
  return Option.some(path.relative(root, file));
});
