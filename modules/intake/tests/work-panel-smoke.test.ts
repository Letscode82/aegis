/** Smoke: the work panel module transforms (JSX) and imports resolve. */
import { describe, expect, it } from "vitest";
describe("WorkPanel module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/work-panel.jsx" as never);
    expect(typeof mod.WorkPanel).toBe("function");
  });
});
