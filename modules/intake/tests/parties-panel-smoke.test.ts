/** Smoke: the parties panel module transforms (JSX) and imports resolve. */
import { describe, expect, it } from "vitest";
describe("PartiesPanel module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/parties-panel.jsx" as never);
    expect(typeof mod.PartiesPanel).toBe("function");
  });
});
