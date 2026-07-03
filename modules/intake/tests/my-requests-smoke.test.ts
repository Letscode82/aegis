/** W1-2 smoke: MyRequests component transforms and imports resolve. */
import { describe, expect, it } from "vitest";
describe("MyRequestsTab module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/my-requests.jsx" as never);
    expect(typeof mod.MyRequestsTab).toBe("function");
  });
});
