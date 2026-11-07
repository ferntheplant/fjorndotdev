// Every version the workspace names is exact. A range lets the same manifest install different
// code on different days; an exact version makes each upgrade a diff someone reviews, which is
// what the weekly bump PR is for. `savePrefix: ""` in pnpm-workspace.yaml makes `vp add` write
// exact versions; this test is what holds hand edits to it, from inside the gate's `vp run -r test`.

import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// `1.2.3` or `1.2.3-beta.4`, optionally behind an `npm:` alias (`npm:@scope/name@1.2.3`).
const EXACT = /^(?:npm:(?:@[^@/]+\/)?[^@/]+@)?\d+\.\d+\.\d+(?:-[\w.]+)?$/u;

// What a package may name instead of a version: the catalog entry, or a sibling package.
const PROTOCOLS = ["catalog:", "workspace:"];

// Package name to version, as a catalog or a dependency field holds them.
type Versions = Readonly<Record<string, string>>;

interface PackageManager {
  readonly version?: string;
}

interface DevEngines {
  readonly packageManager?: PackageManager;
}

// The parts of a package.json this test reads. `peerDependencies` is left out: it states what a
// consumer may bring, so a range there is the point.
interface Manifest {
  readonly dependencies?: Versions;
  readonly devDependencies?: Versions;
  readonly optionalDependencies?: Versions;
  readonly devEngines?: DevEngines;
}

const DEPENDENCY_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
]);

// The parts of pnpm-workspace.yaml this test reads.
interface Workspace {
  readonly savePrefix?: string;
  readonly catalog?: Versions;
  readonly catalogs?: Readonly<Record<string, Versions>>;
}

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isVersions = (value: unknown): value is Versions =>
  isObject(value) && Object.values(value).every(isString);

const isPackageManager = (value: unknown): value is PackageManager =>
  isObject(value) && (!("version" in value) || isString(value.version));

const isDevEngines = (value: unknown): value is DevEngines =>
  isObject(value) &&
  (!("packageManager" in value) || isPackageManager(value.packageManager));

const isManifest = (value: unknown): value is Manifest =>
  isObject(value) &&
  Object.entries(value).every(
    ([field, content]) =>
      (!DEPENDENCY_FIELDS.has(field) || isVersions(content)) &&
      (field !== "devEngines" || isDevEngines(content))
  );

const isCatalogs = (value: unknown): value is Workspace["catalogs"] =>
  isObject(value) && Object.values(value).every(isVersions);

const isWorkspace = (value: unknown): value is Workspace =>
  isObject(value) &&
  (!("savePrefix" in value) || isString(value.savePrefix)) &&
  (!("catalog" in value) || isVersions(value.catalog)) &&
  (!("catalogs" in value) || isCatalogs(value.catalogs));

// Reads a workspace file, YAML or JSON by its extension, and holds it to the shape `guard` names.
const read = <T>(path: string, guard: (value: unknown) => value is T): T => {
  const text = readFileSync(`${root}${path}`, "utf-8");
  const parsed: unknown = path.endsWith(".yaml")
    ? parse(text)
    : JSON.parse(text);
  if (!guard(parsed)) {
    throw new TypeError(`${path} is not in the expected shape`);
  }
  return parsed;
};

// The `name@version` pairs whose version is not exact.
const ranged = (versions: Versions = {}): string[] =>
  Object.entries(versions)
    .filter(([, version]) => !EXACT.test(version))
    .map(([name, version]) => `${name}@${version}`);

// The dependencies that name a version directly instead of going through the catalog.
const uncataloged = (manifest: Manifest): string[] =>
  [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ]
    .flatMap((versions) => Object.entries(versions ?? {}))
    .filter(
      ([, version]) =>
        !PROTOCOLS.some((protocol) => version.startsWith(protocol))
    )
    .map(([name, version]) => `${name}@${version}`);

// The `packages` globs in pnpm-workspace.yaml, plus the root.
const manifests = [
  "package.json",
  ...globSync(
    ["apps/*/package.json", "packages/*/package.json", "tools/*/package.json"],
    { cwd: root }
  ).toSorted(),
];

const workspace = read("pnpm-workspace.yaml", isWorkspace);

describe(ranged, () => {
  it("accepts exact versions, prereleases, and exact npm aliases", () => {
    expect(
      ranged({
        a: "1.2.3",
        b: "1.0.0-beta.4",
        c: "npm:left-pad@1.3.0",
        vite: "npm:@voidzero-dev/vite-plus-core@1.1.0",
      })
    ).toStrictEqual([]);
  });

  it("rejects ranges, partial versions, tags, and ranged aliases", () => {
    expect(
      ranged({
        a: "^1.2.3",
        b: "~1.2.3",
        c: "24",
        d: "latest",
        e: "npm:left-pad@^1.3.0",
      })
    ).toStrictEqual([
      "a@^1.2.3",
      "b@~1.2.3",
      "c@24",
      "d@latest",
      "e@npm:left-pad@^1.3.0",
    ]);
  });
});

describe(uncataloged, () => {
  it("accepts catalog and workspace references", () => {
    expect(
      uncataloged({
        dependencies: { a: "catalog:", b: "workspace:*" },
        devDependencies: { c: "catalog:" },
      })
    ).toStrictEqual([]);
  });

  it("rejects a version named directly, exact or not", () => {
    expect(
      uncataloged({
        dependencies: { a: "1.2.3" },
        devDependencies: { b: "^4.0.0" },
      })
    ).toStrictEqual(["a@1.2.3", "b@^4.0.0"]);
  });
});

describe("pnpm-workspace.yaml", () => {
  it("saves exact versions", () => {
    expect(workspace.savePrefix).toBe("");
  });

  it("pins every catalog entry exactly", () => {
    expect(Object.keys(workspace.catalog ?? {})).not.toHaveLength(0);
    expect(ranged(workspace.catalog)).toStrictEqual([]);
  });

  it("pins every named catalog's entries exactly", () => {
    expect(
      Object.values(workspace.catalogs ?? {}).flatMap((catalog) =>
        ranged(catalog)
      )
    ).toStrictEqual([]);
  });
});

describe("workspace packages", () => {
  it("finds the packages it checks", () => {
    expect(manifests).toContain("tools/workspace-conventions/package.json");
  });

  it.each(manifests)("%s takes every version from the catalog", (manifest) => {
    expect(uncataloged(read(manifest, isManifest))).toStrictEqual([]);
  });
});

describe("root package", () => {
  it("pins the package manager exactly", () => {
    const manifest = read("package.json", isManifest);
    expect(manifest.devEngines?.packageManager?.version).toMatch(EXACT);
  });
});
