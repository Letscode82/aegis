/**
 * Production agent gating — non-production-ready agents (deterministic
 * mocks: Trademark, Contract Review) are hidden from production and only
 * surface when NEXT_PUBLIC_AEGIS_DEMO_AGENTS=true.
 *
 * This is the conservative-AI corollary to the safe-fallback fix: a
 * paying customer must never see fabricated analysis. A ticket of a
 * mock-agent type falls through to honest manual triage (routeToAgent
 * returns null) instead of getting a fake clearance scan.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/ai", () => ({
  callClaudeJSON: vi.fn(),
  callClaude: vi.fn(),
  friendlyAIError: () => "unavailable",
  classifyIntakeRegex: () => null,
}));

const {
  filterActiveAgents,
  AGENTS_BY_ID,
  NDAAgent,
  TrademarkAgent,
  ContractReviewAgent,
} = await import("../src/agents/index.js" as never);

describe("filterActiveAgents() — production gate", () => {
  const all = [
    NDAAgent,
    TrademarkAgent,
    ContractReviewAgent,
  ];

  it("hides productionReady:false agents when demo mode is OFF", () => {
    const active = filterActiveAgents(all, false);
    const ids = active.map((a: { id: string }) => a.id);
    expect(ids).toContain("nda-agent");
    expect(ids).not.toContain("trademark-agent");
    expect(ids).not.toContain("contract-review-agent");
  });

  it("surfaces all agents when demo mode is ON", () => {
    const active = filterActiveAgents(all, true);
    const ids = active.map((a: { id: string }) => a.id);
    expect(ids).toContain("nda-agent");
    expect(ids).toContain("trademark-agent");
    expect(ids).toContain("contract-review-agent");
  });

  it("treats undefined productionReady as production-ready (backwards-safe)", () => {
    const legacyAgent = { id: "legacy", canHandle: () => false };
    expect(filterActiveAgents([legacyAgent], false)).toHaveLength(1);
  });
});

describe("the two mock agents are flagged productionReady:false", () => {
  it("Trademark is a mock pending real TM search", () => {
    expect(TrademarkAgent.productionReady).toBe(false);
    expect(TrademarkAgent.requiresBackend).toMatch(/USPTO|EUIPO|WIPO/);
  });
  it("Contract Review is a mock pending Contract Intelligence", () => {
    expect(ContractReviewAgent.productionReady).toBe(false);
    expect(ContractReviewAgent.requiresBackend).toMatch(/Contract Intelligence/i);
  });
});

describe("AGENTS_BY_ID stays complete (UI must resolve hidden-agent metadata)", () => {
  it("includes hidden agents so historical recs still render", () => {
    // Even with the agents hidden from routing, a stored Trademark
    // recommendation must still resolve its name/icon in the Cockpit.
    expect(AGENTS_BY_ID["trademark-agent"]).toBeDefined();
    expect(AGENTS_BY_ID["contract-review-agent"]).toBeDefined();
    expect(AGENTS_BY_ID["nda-agent"]).toBeDefined();
  });
});

describe("the four real agents are production-ready", () => {
  it.each([
    "nda-agent",
    "faq-agent",
    "vendor-intake-agent",
    "policy-qa-agent",
  ])("%s is productionReady", (id) => {
    expect(AGENTS_BY_ID[id].productionReady).toBe(true);
  });
});
