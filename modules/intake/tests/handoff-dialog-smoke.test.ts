/** Smoke: the hand-off dialog module transforms (JSX) and imports
 *  resolve — guards the Track 1 cockpit hand-off surface. */
import { describe, expect, it } from "vitest";
describe("HandoffDialog module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/handoff-dialog.jsx" as never);
    expect(typeof mod.HandoffDialog).toBe("function");
  });
});
