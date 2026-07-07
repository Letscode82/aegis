/**
 * Production agent gate. The mechanism (filterActiveAgents +
 * productionReady flag + NEXT_PUBLIC_AEGIS_DEMO_AGENTS) is retained for
 * any future not-yet-real agent. As of the real Trademark + Contract
 * Review agents, ALL six agents are productionReady:true and visible by
 * default — so the gate currently hides nothing, but the contract is
 * still enforced for the next mock that lands.
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
  ALL_AGENTS,
  NDAAgent,
} = await import("../src/agents/index.js" as never);

describe("filterActiveAgents() — gate mechanism (synthetic agents)", () => {
  const realAgent = { id: "real", productionReady: true, canHandle: () => false };
  const mockAgent = { id: "mock", productionReady: false, canHandle: () => false };
  const legacyAgent = { id: "legacy", canHandle: () => false }; // undefined flag

  it("hides productionReady:false agents when demo mode is OFF", () => {
    const ids = filterActiveAgents([realAgent, mockAgent], false).map((a: { id: string }) => a.id);
    expect(ids).toContain("real");
    expect(ids).not.toContain("mock");
  });

  it("surfaces productionReady:false agents when demo mode is ON", () => {
    const ids = filterActiveAgents([realAgent, mockAgent], true).map((a: { id: string }) => a.id);
    expect(ids).toEqual(["real", "mock"]);
  });

  it("treats undefined productionReady as production-ready (backwards-safe)", () => {
    expect(filterActiveAgents([legacyAgent], false)).toHaveLength(1);
  });
});

describe("all six agents are production-ready and visible by default", () => {
  it.each([
    "nda-agent",
    "faq-agent",
    "vendor-intake-agent",
    "policy-qa-agent",
    "trademark-agent",
    "contract-review-agent",
  ])("%s is productionReady", (id) => {
    expect(AGENTS_BY_ID[id].productionReady).toBe(true);
  });

  it("ALL_AGENTS contains all six in production mode (none hidden)", () => {
    expect(ALL_AGENTS.length).toBe(11);
  });
});

describe("the formerly-mock agents are now real (no mock markers)", () => {
  it("Trademark no longer declares requiresBackend", () => {
    expect(AGENTS_BY_ID["trademark-agent"].requiresBackend).toBeUndefined();
  });
  it("Contract Review no longer declares requiresBackend", () => {
    expect(AGENTS_BY_ID["contract-review-agent"].requiresBackend).toBeUndefined();
  });
});

describe("AGENTS_BY_ID is complete", () => {
  it("resolves every agent for the UI", () => {
    expect(Object.keys(AGENTS_BY_ID)).toHaveLength(11);
    expect(AGENTS_BY_ID[NDAAgent.id]).toBeDefined();
  });
});
