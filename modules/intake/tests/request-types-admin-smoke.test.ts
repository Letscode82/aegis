/** Smoke: request-types admin module transforms (JSX) and imports resolve. */
import { describe, expect, it } from "vitest";
describe("RequestTypesTab module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/request-types-admin.jsx" as never);
    expect(typeof mod.RequestTypesTab).toBe("function");
  });
});
