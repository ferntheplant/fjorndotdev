// Script names are a contract between packages and the root: `vp run -r <name>` reaches every
// package that defines `<name>`, so a bare name means "fan this out". This test holds the workspace
// to the names below, from inside the gate's `vp run -r test`.

import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// The only names `vp run -r` fans out. Anything else a package runs is namespaced
// (`db:migrate`, `gen:routes`) and run with `--filter`.
const VERBS = new Set(["build", "dev", "test"]);

// Workspace-wide checks run once, as built-ins against the root config (`vp check` reads the root
// `lint` block even from inside a package). A package script by one of these names, namespaced or
// not, either repeats that config or drifts from it, and `vp run check` would no longer mean
// `vp check`.
const RESERVED = new Set(["check", "fmt", "format", "lint", "typecheck"]);

// The root holds only composite commands; per-package work lives in the packages.
const ROOT_SCRIPTS = ["prepare", "ready"];

const misnamed = (scripts: string[]): string[] =>
  scripts.filter((name) => {
    const colon = name.indexOf(":");
    const head = colon === -1 ? name : name.slice(0, colon);
    return RESERVED.has(head) || (colon === -1 && !VERBS.has(name));
  });

// The one part of a package.json this test reads: the names in `scripts`, if any.
interface Manifest {
  readonly scripts?: object;
}

const isManifest = (value: unknown): value is Manifest =>
  typeof value === "object" &&
  value !== null &&
  (!("scripts" in value) ||
    (typeof value.scripts === "object" && value.scripts !== null));

const scriptsOf = (manifest: string): string[] => {
  const parsed: unknown = JSON.parse(
    readFileSync(`${root}${manifest}`, "utf-8")
  );
  if (!isManifest(parsed)) {
    throw new TypeError(`${manifest} is not a package manifest`);
  }
  return Object.keys(parsed.scripts ?? {});
};

// The `packages` globs in pnpm-workspace.yaml.
const manifests = globSync(
  ["apps/*/package.json", "packages/*/package.json", "tools/*/package.json"],
  {
    cwd: root,
  }
).toSorted();

describe(misnamed, () => {
  it("allows the shared verbs and namespaced names", () => {
    expect(
      misnamed(["test", "build", "dev", "db:migrate", "gen:routes"])
    ).toStrictEqual([]);
  });

  it("rejects reserved names, namespaced or not, and bare names outside the verbs", () => {
    expect(
      misnamed(["lint", "check:types", "fmt", "start", "test"])
    ).toStrictEqual(["lint", "check:types", "fmt", "start"]);
  });
});

describe("workspace packages", () => {
  it("finds the packages it checks", () => {
    expect(manifests).toContain("tools/workspace-conventions/package.json");
  });

  it.each(manifests)("%s has a test script", (manifest) => {
    expect(scriptsOf(manifest)).toContain("test");
  });

  it.each(manifests)(
    "%s uses only shared verbs and namespaced names",
    (manifest) => {
      expect(misnamed(scriptsOf(manifest))).toStrictEqual([]);
    }
  );
});

describe("root package", () => {
  it("holds only composite commands", () => {
    expect(scriptsOf("package.json").toSorted()).toStrictEqual(ROOT_SCRIPTS);
  });
});
