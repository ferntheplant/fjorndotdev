import { describe, expect, it } from "vite-plus/test";

// The deploy job is the only other thing that loads the stack, so a dependency mismatch would
// otherwise surface only after a merge to main: alchemy 2.0.0-beta.81 imports `effect/Crypto`,
// which Effect 4.1 removed, and `alchemy deploy` failed with ERR_MODULE_NOT_FOUND.
describe("the Alchemy stack", () => {
  it("loads with the installed Effect and alchemy", async () => {
    const stack = await import("./alchemy.run.ts");

    expect(stack.default).toBeDefined();
  });
});
