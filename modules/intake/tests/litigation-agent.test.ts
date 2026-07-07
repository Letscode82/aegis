/**
 * Litigation Support Agent (doc Agent 10) — assembles a cited case
 * brief with a deterministic record pull + over-inclusive hold-trigger
 * flag; NEVER places a legal hold; always human-reviewed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  callClaude: vi.fn(),
  friendlyAIError: () => "AI unavailable.",
}));
const checkCounterpartyMock = vi.fn();
vi.mock("../src/agents/counterparty-lookup", () => ({
  checkCounterpartyRelationship: checkCounterpartyMock,
}));

const { LitigationAgent } = await import("../src/agents/litigation.js" as never);
const { routeToAgent, ALL_AGENTS, AGENTS_BY_ID } = await import(
  "../src/agents/index.js" as never
);

beforeEach(() => {
  callClaudeJSONMock.mockReset();
  callClaudeJSONMock.mockRejectedValue(new Error("boom"));
  checkCounterpartyMock.mockReset().mockResolvedValue({
    found: false, counterpartyId: null, counterpartyName: null,
    priorMatterCount: 0, priorNda: null, note: "No existing relationship on file.",
  });
});

describe("LitigationAgent", () => {
  it("is registered (7 agents) and resolvable by id", () => {
    expect(ALL_AGENTS.length).toBe(11);
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

  // ── Agent 10 upgrade: record pull + hold trigger + gap discipline ──

  it("extracts the adverse party deterministically from common phrasings", () => {
    expect(LitigationAgent.extractAdverseParty("We received a demand letter from Meridian Corp regarding unpaid invoices")).toBe("Meridian Corp");
    expect(LitigationAgent.extractAdverseParty("Claim against Acme Robotics for breach")).toBe("Acme Robotics");
    expect(LitigationAgent.extractAdverseParty("Vertex Labs has threatened legal action over the license")).toBe("Vertex Labs");
    expect(LitigationAgent.extractAdverseParty("we may get sued at some point")).toBeNull();
  });

  it("cites record-pull facts (prior matters + prior agreement) as concerns and precedent link", async () => {
    checkCounterpartyMock.mockResolvedValue({
      found: true, counterpartyId: "cp1", counterpartyName: "Meridian Corp",
      priorMatterCount: 3,
      priorNda: { documentId: "d1", name: "Meridian MSA 2024", uploadedAt: "2024-03-01T00:00:00Z" },
      note: "on file",
    });
    callClaudeJSONMock.mockResolvedValue({
      draftedResponse: "1. PARTIES...\n7. GAP ANALYSIS...", confidence: 0.8, reasoning: "r", concerns: [],
    });
    const rec = await LitigationAgent.process({ from: "Dana Lee", dept: "Sales", desc: "Demand letter from Meridian Corp regarding the supply contract" });
    expect(rec.concerns.some((c: string) => /Record pull:.*Meridian Corp.*3 prior matters.*Meridian MSA 2024/.test(c))).toBe(true);
    expect(rec.precedentLinks).toEqual([{ id: "d1", title: "Meridian MSA 2024" }]);
  });

  it("no-record case states the record-is-not-the-world discipline", async () => {
    callClaudeJSONMock.mockResolvedValue({ draftedResponse: "brief", confidence: 0.7, reasoning: "r", concerns: [] });
    const rec = await LitigationAgent.process({ from: "Dana Lee", dept: "Sales", desc: "Demand letter from Unknown Ventures regarding fees" });
    expect(rec.concerns.some((c: string) => /NO record.*not the world/i.test(c))).toBe(true);
  });

  it("hold-trigger flag is over-inclusive: proposed scope on every intake, even degraded", async () => {
    const rec = await LitigationAgent.process({ from: "Dana Lee", dept: "Sales", desc: "subpoena received" });
    expect(rec.concerns.some((c: string) => /Legal-hold trigger flagged.*Proposed initial scope.*Dana Lee/.test(c))).toBe(true);
  });
});
