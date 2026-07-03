/** Smoke: W4-1 PanelBoundary exports + fallback contract. */
import { describe, expect, it } from "vitest";

describe("PanelBoundary (@aegis/ui)", () => {
  it("exports a React class component with the boundary contract", async () => {
    const mod = await import("@aegis/ui");
    const PB = (mod as Record<string, unknown>).PanelBoundary as {
      getDerivedStateFromError?: (e: Error) => unknown;
      prototype?: { render?: unknown; componentDidCatch?: unknown };
    };
    expect(typeof PB).toBe("function");
    // The two lifecycle pieces that make it an error boundary.
    expect(typeof PB.getDerivedStateFromError).toBe("function");
    expect(typeof PB.prototype?.componentDidCatch).toBe("function");
    expect(PB.getDerivedStateFromError!(new Error("x"))).toMatchObject({
      error: expect.any(Error),
    });
  });
});
