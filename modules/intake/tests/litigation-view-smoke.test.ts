/** Smoke + unit: litigation-view module transforms and its detector works. */
import { describe, expect, it } from "vitest";
const mod = await import("../src/intake/litigation-view.jsx" as never);

describe("litigation-view", () => {
  it("exports the component + detector", () => {
    expect(typeof mod.LitigationSummaryCard).toBe("function");
    expect(typeof mod.isLitigationTicket).toBe("function");
  });
  it("detects litigation tickets by agent, type, or category", () => {
    expect(mod.isLitigationTicket({ agentRecommendation: { agentId: "litigation-agent" } })).toBe(true);
    expect(mod.isLitigationTicket({ type: "Litigation / Dispute" })).toBe(true);
    expect(mod.isLitigationTicket({ aiTriage: { category: "Litigation — Non-Court" } })).toBe(true);
    expect(mod.isLitigationTicket({ type: "NDA Request" })).toBe(false);
    expect(mod.isLitigationTicket(null)).toBe(false);
  });
});
