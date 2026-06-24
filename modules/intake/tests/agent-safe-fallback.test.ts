/**
 * Conservative-AI safety invariant — when an agent's Claude call fails,
 * the degraded fallback recommendation must NEVER recommend auto-send.
 * It is always flagged for human review at low confidence.
 *
 * This was the production bug surfaced during the Jun-2026 model-sunset
 * outage: agents kept suggestedAction:"approve-and-send" at confidence
 * 0.78–0.88 even when Claude was unreachable, so the Cockpit recommended
 * approving un-reviewed template text. All four Claude-calling agents
 * (NDA, FAQ, Vendor Intake, Policy Q&A) now route their catch-block
 * through buildDegradedRec().
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Force every Claude call to fail so we exercise the fallback path.
const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  callClaude: vi.fn(),
  friendlyAIError: () => "AI assistant is unavailable right now. Please try again or use the structured form.",
}));

const { buildDegradedRec, DEGRADED_CONFIDENCE, DEGRADED_ACTION } = await import(
  "../src/agents/build-rec.js" as never
);
const { NDAAgent } = await import("../src/agents/nda.js" as never);
const { VendorIntakeAgent } = await import("../src/agents/vendor-intake.js" as never);

beforeEach(() => {
  callClaudeJSONMock.mockReset();
  callClaudeJSONMock.mockRejectedValue(
    Object.assign(new Error("Claude API 404: model deprecated"), { status: 404 }),
  );
});

describe("buildDegradedRec() — the safety chokepoint", () => {
  it("forces flag-for-review at low confidence and marks mock", () => {
    const rec = buildDegradedRec("test-agent", {
      draftedResponse: "some template text",
      reasoning: "whatever the agent wanted to say",
      concerns: ["agent-specific concern"],
    });
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.suggestedAction).not.toBe("approve-and-send");
    expect(rec.confidence).toBe(DEGRADED_CONFIDENCE);
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
  });

  it("prepends a standard 'AI review unavailable' lead concern", () => {
    const rec = buildDegradedRec("test-agent", { concerns: ["x"] });
    expect(rec.concerns[0]).toMatch(/AI review unavailable/i);
    expect(rec.concerns).toContain("x");
  });

  it("exports the invariant constants", () => {
    expect(DEGRADED_ACTION).toBe("flag-for-review");
    expect(DEGRADED_CONFIDENCE).toBeLessThan(0.7);
  });
});

describe("NDA agent — degraded fallback on Claude failure", () => {
  it("never recommends auto-send when Claude is down", async () => {
    const ticket = {
      id: "REQ-T1",
      from: "Alex Nguyen",
      dept: "Sales",
      type: "NDA Request",
      desc: "Mutual NDA with Acme Robotics for data sharing, 2-year term",
    };
    const rec = await NDAAgent.process(ticket);
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
    // Still surfaces a usable template draft for the attorney.
    expect(rec.draftedResponse).toMatch(/NDA/i);
    expect(rec.concerns[0]).toMatch(/AI review unavailable/i);
  });
});

describe("Vendor Intake agent — degraded fallback on Claude failure", () => {
  it("never auto-approves onboarding when Claude is down (clean sanctions path)", async () => {
    // "Germany" is a clean jurisdiction; mockSanctionsCheck returns clear,
    // so we reach the Claude call — which we've forced to fail.
    const ticket = {
      id: "REQ-T2",
      from: "Dmitri Volkov",
      dept: "Procurement",
      type: "Vendor Due Diligence",
      aiTriage: { category: "vendor due diligence" },
      desc: "Vendor: DataFlux Analytics in Germany — standard onboarding",
    };
    const rec = await VendorIntakeAgent.process(ticket);
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.suggestedAction).not.toBe("approve-and-send");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
  });

  it("still hard-escalates a sanctions hit regardless of Claude (no degrade)", async () => {
    // Iran is a hardcoded sanctions block — this path never calls Claude,
    // so it must keep its high-confidence escalate, NOT degrade.
    const ticket = {
      id: "REQ-T3",
      from: "Dmitri Volkov",
      dept: "Procurement",
      type: "Vendor Due Diligence",
      aiTriage: { category: "vendor due diligence" },
      desc: "Vendor: Persia Trading in Iran — onboarding request",
    };
    const rec = await VendorIntakeAgent.process(ticket);
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.confidence).toBeGreaterThan(0.7);
  });
});
