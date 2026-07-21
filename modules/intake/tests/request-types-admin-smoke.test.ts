/** Smoke: request-types admin module transforms (JSX) and imports resolve.
 *  RequestTypesTab was removed (dead code — superseded by the Workflows
 *  editor, which reuses TypeForm + FieldsEditor). These two are the
 *  surviving public surface. */
import { describe, expect, it } from "vitest";
describe("request-types-admin module", () => {
  it("exports the reusable editors used by Workflows", async () => {
    const mod = await import("../src/intake/request-types-admin.jsx" as never);
    expect(typeof mod.TypeForm).toBe("function");
    expect(typeof mod.FieldsEditor).toBe("function");
  });
});
