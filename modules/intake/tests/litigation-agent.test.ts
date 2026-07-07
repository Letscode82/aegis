/**
 * Litigation Intake Agent (Phase 1 item 4) — triages non-court-facing
 * disputes; tracking-only, NEVER places a legal hold; always human-reviewed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  callClaude: vi.fn(),
  friendlyAIError: () => "AI unavailable.",
}));

const { LitigationAgent } = await import("../src/agents/litigation.js" as never);
const { routeToAgent, ALL_AGENTS, AGENTS_BY_ID } = await import(
  "../src/agents/index.js" as never
);

beforeEach(() => {
  callClaudeJSONMock.mockReset();
  callClaudeJSONMock.mockRejectedValue(new Error("boom"));
});

describe("LitigationAgent", () => {
  it("is registered (7 agents) and resolvable by id", () => {
    expect(ALL_AGENTS.length).toBe(9);
    expect(AGENTS_BY_ID["litigation-agent"]).toBeTruthy();
  });

  it("canHandle disputes / demands / subpoenas", () => {
    expect(LitigationAgent.canHandle({ desc: "We were served with a subpoena from Acme." })).toBe(true);
    expect(LitigationAgent.canHandle({ desc: "Received a demand letter threatening litigation." })).toBe(true);
    expect(LitigationAgent.canHandle({ aiTriage: { category: "Litigation — Non-Court" }, desc: "" })).toBe(true);
    expect(LitigationAgent.canHandle({ desc: "Please draft a standard mutual NDA." })).toBe(false);
  });

  it("routes a litigation ticket to the litigation agent", () => {
    const agent = routeToAgent({ type: "Litigation", aiTriage: { category: "Litigation — Non-Court" }, desc: "Demand letter from a vendor." });
    expect(agent?.id).toBe("litigation-agent");
  });

  it("triages to flag-for-review and NEVER auto-sends; always carries a no-legal-hold concern", async () => {
    callClaudeJSONMock.mockResolvedValue({
      draftedResponse: "Adverse party: Acme. Claim: breach. Deadline: 20 days. Tier: senior counsel.",
      alternativeTone: "Demand letter — escalate.",
      confidence: 0.9,
      reasoning: "Clear demand with a deadline.",
      concerns: ["Confirm the response deadline."],
    });
    const rec = await LitigationAgent.process({ from: "Dana Lee", dept: "Sales", desc: "Served with a demand letter from Acme, 20-day deadline." });
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.concerns.some((c: string) => /legal hold|preservation/i.test(c))).toBe(true);
    expect(rec.draftedResponse).toMatch(/Acme/);
  });

  it("degrades safely when Claude is unavailable (still no legal hold, manual triage)", async () => {
    // Claude rejection is armed in beforeEach — exercises the catch/degraded path.
    const rec = await LitigationAgent.process({ from: "Dana Lee", dept: "Sales", desc: "subpoena received" });
    expect(rec.mock).toBe(true);
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.concerns.some((c: string) => /legal hold|preservation/i.test(c))).toBe(true);
  });
});
