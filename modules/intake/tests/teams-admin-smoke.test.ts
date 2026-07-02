/** Smoke: the Teams admin component module transforms (JSX) and its
 *  imports resolve. Guards against a broken import / syntax error in the
 *  Track 1 demo-UI surface without needing a browser render. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/auth/react", () => ({ useCurrentUser: () => ({ user: null }) }));

describe("TeamsTab module", () => {
  it("exports a component function", async () => {
    const mod = await import("../src/intake/teams-admin.jsx" as never);
    expect(typeof mod.TeamsTab).toBe("function");
  });
});
