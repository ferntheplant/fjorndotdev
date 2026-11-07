// Turns the output of a failed `vp run -v --log grouped ready` into only what an agent needs:
// the output of each step that failed, trimmed. Pure, so the parsing can be tested against
// captured output; `main.ts` does the running.
//
// `--log grouped` prints a `[pkg#task] $ command` header when each step starts, and the step's
// output later, as one block under a `── [pkg#task] ──` separator. Steps that run in parallel
// (`vp run -r test`) print their headers back to back and their blocks in finishing order, so
// a block belongs to the step its separator names, not to whichever header came last.
//
// Which steps failed comes from the summary `-v` prints after the step output: one
// `[n] pkg#task: $ command ✓|✗` line per step, also in finishing order. It is read from this
// run's own output, never from `vp run --last-details`, which reports whichever run in the
// checkout finished last and so mixes up concurrent gates.

import { Effect, Option } from "effect";

const MAX_LINES = 120;
const FALLBACK_LINES = 40;

interface Step {
  key: string;
  command: string;
  lines: string[];
}
interface Outcome {
  key: string;
  command: string;
  failed: boolean;
  exitCode: number | undefined;
}

// `[@baseline/root#ready] $ vp check ○ cache miss: …` → key `@baseline/root#ready`, command
// `$ vp check`: the cache note after ◉/○/⊘ is dropped so the command compares exactly with the
// one the summary prints. A package step's command carries its directory: `~/apps/x$ …`.
const HEADER =
  /^\[(?<key>[^\]\s]+#[^\]\s]+)\] (?<command>.*?\$ .*?)(?: [◉○⊘] .*)?$/u;
const SEPARATOR = /^── \[(?<key>[^\]\s]+#[^\]\s]+)\] ──$/u;

// `-v` opens its summary with a rule and this title; everything before it is step output.
const SUMMARY = /^━+\n\s*Vite\+ Task Runner • Execution Summary$/mu;

const splitSteps = (body: string): Step[] => {
  const steps: Step[] = [];
  let current: Step | undefined;
  for (const line of body.split("\n")) {
    const header = HEADER.exec(line)?.groups;
    const separator = SEPARATOR.exec(line)?.groups;
    if (header?.key !== undefined && header.command !== undefined) {
      current = { command: header.command, key: header.key, lines: [] };
      steps.push(current);
    } else if (separator === undefined) {
      current?.lines.push(line);
    } else {
      // Steps under one key run one after another, so the latest header with that key is the
      // step whose output this is.
      current = steps.findLast((step) => step.key === separator.key);
    }
  }
  return steps;
};

// `  [3] @baseline/root#ready: $ vp check ✗ (exit code: 1)` → key, command, and outcome.
const OUTCOME =
  /^\s*\[\d+\] (?<key>\S+#\S+): (?<command>.*\$ .*?) (?<mark>[✓✗])(?: \(exit code: (?<exitCode>\d+)\))?/u;

const outcomes = (summary: string): Outcome[] =>
  summary.split("\n").flatMap((line) => {
    const match = OUTCOME.exec(line)?.groups;
    if (match?.key === undefined || match.command === undefined) {
      return [];
    }
    const exitCode =
      match.exitCode === undefined ? undefined : Number(match.exitCode);
    return [
      {
        command: match.command,
        exitCode,
        failed: match.mark === "✗",
        key: match.key,
      },
    ];
  });

// When one step fails, vp kills the steps still running beside it: they report ✗ with a signal
// exit (137 for SIGKILL, 143 for SIGTERM) even when their own work had passed.
const killed = (outcome: Outcome): boolean =>
  outcome.exitCode === 137 || outcome.exitCode === 143;

// Pair each outcome with its step. Both lists are in a different order (starting vs finishing),
// but steps sharing a key and command run one after another, so the nth outcome for a given
// key and command is the nth step with them.
const failedSteps = (
  steps: Step[],
  results: Outcome[]
): { outcome: Outcome; step: Step | undefined }[] => {
  const claimed = new Set<Step>();
  return results.flatMap((outcome) => {
    const step = steps.find(
      (s) =>
        !claimed.has(s) &&
        s.key === outcome.key &&
        s.command === outcome.command
    );
    if (step) {
      claimed.add(step);
    }
    return outcome.failed ? [{ outcome, step }] : [];
  });
};

// Saves the full gate output and says where, for an omission marker to point at. Run only when
// something is actually omitted, so a short failure leaves no file behind, and at most once per
// report.
export type SaveFullOutput<R> = Effect.Effect<Option.Option<string>, never, R>;

const omitted = <R>(
  count: number,
  save: SaveFullOutput<R>
): Effect.Effect<string, never, R> =>
  Effect.map(
    save,
    Option.match({
      onNone: () => `… ${count} lines omitted …`,
      onSome: (path) => `… ${count} lines omitted; full output: ${path} …`,
    })
  );

const meaningful = (lines: string[]): string[] =>
  lines.filter((line) => line.trim() !== "" && !line.startsWith("pass: "));

// Keep the head, where linters report, and the tail, where test runners summarise.
export const trim = <R = never>(
  lines: string[],
  {
    max = MAX_LINES,
    save = Effect.succeedNone,
  }: { max?: number; save?: SaveFullOutput<R> } = {}
): Effect.Effect<string[], never, R> => {
  const kept = meaningful(lines);
  if (kept.length <= max) {
    return Effect.succeed(kept);
  }
  const head = Math.floor(max * 0.7);
  return Effect.map(omitted(kept.length - max, save), (marker) => [
    ...kept.slice(0, head),
    marker,
    ...kept.slice(head - max),
  ]);
};

export const condense = <R = never>(
  gateOutput: string,
  saveFullOutput: SaveFullOutput<R> = Effect.succeedNone
): Effect.Effect<string, never, R> =>
  Effect.gen(function* () {
    const save = yield* Effect.cached(saveFullOutput);
    const [body = "", summary = ""] = gateOutput.split(SUMMARY);
    const all = failedSteps(splitSteps(body), outcomes(summary));
    // Report killed steps as failures only when nothing else failed: then the kill was the cause
    // (out of memory, a timeout), not a side effect of another step's failure.
    const failures = all.some(({ outcome }) => !killed(outcome))
      ? all.filter(({ outcome }) => !killed(outcome))
      : all;
    const stopped = all.filter((entry) => !failures.includes(entry));

    if (
      failures.length === 0 ||
      failures.some(({ step }) => step === undefined)
    ) {
      // Failed before any step ran (a config error, a missing tool), or the output format moved
      // out from under the parser: show the end of the raw output rather than hide it.
      const raw = meaningful(gateOutput.split("\n"));
      const tail =
        raw.length > FALLBACK_LINES
          ? [yield* omitted(raw.length - FALLBACK_LINES, save)]
          : [];
      return ["ready: failed", ...tail, ...raw.slice(-FALLBACK_LINES)].join(
        "\n"
      );
    }

    const blocks = yield* Effect.forEach(failures, ({ outcome, step }) =>
      Effect.map(trim(step?.lines ?? [], { save }), (lines) => [
        `ready: failed at ${outcome.key}: ${outcome.command}`,
        ...lines,
      ])
    );
    return [
      ...blocks.flat(),
      ...stopped.map(
        ({ outcome }) =>
          `ready: stopped early, result unknown: ${outcome.key}: ${outcome.command}`
      ),
    ].join("\n");
  });
