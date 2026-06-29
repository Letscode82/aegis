/**
 * Agent routing contract (Intake P2b hardening).
 *
 * Table-driven proof that every intake type routes to the expected
 * agent — or to null (honest manual triage) when no agent claims it.
 * Locks the specificity-ordered router + the production gate so a future
 * canHandle tweak can't silently re-route or shadow another agent.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// routeToAgent only calls canHandle (pure) — mock @aegis/ai so the agent
// modules import cleanly without touching the network.
vi.mock("@aegis/ai", () => ({
  callClaude: vi.fn(),
  callClaudeJSON: vi.fn(),
  friendlyAIError: () => "unavailable",
  classifyIntakeRegex: () => null,
}));

// Default import = production mode (NEXT_PUBLIC_AEGIS_DEMO_AGENTS unset).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prod = await import("../src/agents/index.js" as any);

const t = (over: Record<string, unknown>) => ({
  id: "REQ-X",
  from: "Alex Nguyen",
  dept: "Eng",
  desc: "",
  type: "",
  ...over,
});

describe("production routing (mock agents hidden)", () => {
  it.each([
    // [label, ticket, expectedAgentId|null]
    ["NDA request → NDA agent", t({ type: "NDA Request", desc: "Mutual NDA with Acme for data sharing" }), "nda-agent"],
    ["Vendor DD → Vendor agent", t({ type: "Vendor Due Diligence", aiTriage: { category: "vendor due diligence" }, desc: "Onboard vendor: Acme in Germany" }), "vendor-intake-agent"],
    ["Contract FAQ → FAQ agent", t({ type: "Contract Question", desc: "What is our standard limitation of liability cap?" }), "faq-agent"],
    ["Policy question → Policy Q&A agent", t({ type: "Legal Question — General", desc: "What is our FCPA policy on gifts to a foreign official?" }), "policy-qa-agent"],
    ["sensitive employment → Policy Q&A (escalation)", t({ type: "Employment Issue", aiTriage: { category: "harassment" }, desc: "ongoing issue with my manager" }), "policy-qa-agent"],
    // Now real + visible by default:
    ["Trademark → Trademark agent", t({ type: "Trademark Check", desc: "Clearance for 'AurorAI' across US/EU" }), "trademark-agent"],
    ["Contract Review → Contract Review agent", t({ type: "Contract Review", desc: "Review the MSA redlines from DataStream" }), "contract-review-agent"],
    // Genuinely uncovered → manual triage:
    ["Unknown ask → null", t({ type: "Other", desc: "Can someone help me think through a novel situation?" }), null],
    ["Empty → null", t({ type: "Other", desc: "" }), null],
  ])("%s", (_label, ticket, expected) => {
    const agent = prod.routeToAgent(ticket, {});
    expect(agent?.id ?? null).toBe(expected);
  });

  it("NDA breach complaint does NOT route to the NDA agent (drafting)", () => {
    // 'breach' guard keeps disputes out of the NDA drafting path.
    const agent = prod.routeToAgent(
      t({ type: "Litigation / Dispute", desc: "Counterparty is in breach of our NDA, possible violation" }),
      {},
    );
    expect(agent?.id).not.toBe("nda-agent");
  });

  it("respects a per-agent disable in settings", () => {
    const ticket = t({ type: "NDA Request", desc: "Mutual NDA with Acme" });
    expect(prod.routeToAgent(ticket, {})?.id).toBe("nda-agent");
    const disabled = prod.routeToAgent(ticket, { "nda-agent": { enabled: false } });
    // With NDA off, an NDA-only description falls through to no match.
    expect(disabled?.id ?? null).not.toBe("nda-agent");
  });
});

// All six agents are productionReady now, so the demo flag changes
// nothing for routing — but the gate must still behave correctly when
// it IS set (no regressions, no double-listing).
describe("demo flag on — routing unchanged (all agents already visible)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AEGIS_DEMO_AGENTS", "true");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("Trademark + Contract Review still route with the flag on", async () => {
    vi.doMock("@aegis/ai", () => ({
      callClaude: vi.fn(),
      callClaudeJSON: vi.fn(),
      friendlyAIError: () => "unavailable",
      classifyIntakeRegex: () => null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const demo = await import("../src/agents/index.js" as any);
    expect(
      demo.routeToAgent(t({ type: "Trademark Check", desc: "Clearance for 'AurorAI'" }), {})?.id,
    ).toBe("trademark-agent");
    expect(
      demo.routeToAgent(t({ type: "Contract Review", desc: "Review MSA redlines" }), {})?.id,
    ).toBe("contract-review-agent");
  });
});
