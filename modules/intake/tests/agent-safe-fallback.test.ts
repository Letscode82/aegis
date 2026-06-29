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
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
const { TrademarkAgent } = await import("../src/agents/trademark.js" as never);
const { ContractReviewAgent } = await import("../src/agents/contract-review.js" as never);

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

describe("Vendor Intake agent — sanctions screening + Claude failure", () => {
  // Screening now runs server-side via fetch(/api/intake/sanctions-check);
  // stub global.fetch per-test to control the screening verdict.
  const realFetch = globalThis.fetch;
  function stubFetch(json: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    }) as never;
  }
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const ticket = {
    id: "REQ-T2",
    from: "Dmitri Volkov",
    dept: "Procurement",
    type: "Vendor Due Diligence",
    aiTriage: { category: "vendor due diligence" },
    desc: "Vendor: DataFlux Analytics in Germany — standard onboarding",
  };

  it("clean screening + Claude down → degraded fallback, never auto-send", async () => {
    stubFetch({ status: "clear", flags: [], matches: [], listAsOf: "2026-06-23" });
    const rec = await VendorIntakeAgent.process(ticket);
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.suggestedAction).not.toBe("approve-and-send");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
  });

  it("sanctions HIT → hard escalate at high confidence (never calls Claude)", async () => {
    stubFetch({
      status: "hit",
      flags: ["Name match on OFAC-SDN: \"Sberbank\""],
      matches: [{ entityName: "Sberbank", source: "OFAC-SDN", programs: [] }],
      listAsOf: "2026-06-23",
    });
    const rec = await VendorIntakeAgent.process(ticket);
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.confidence).toBeGreaterThan(0.7);
  });

  it("screening UNAVAILABLE → flag-for-review, never a false all-clear", async () => {
    stubFetch({
      status: "unavailable",
      flags: ["No sanctions list loaded."],
      matches: [],
      listAsOf: null,
      note: "Manual screening required.",
    });
    const rec = await VendorIntakeAgent.process(ticket);
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.suggestedAction).not.toBe("approve-and-send");
    expect(rec.concerns.join(" ")).toMatch(/screening did NOT run|manual/i);
  });
});

describe("Trademark agent — real agent degraded fallback", () => {
  it("Claude down → flag-for-review, never auto-send", async () => {
    const rec = await TrademarkAgent.process({
      id: "REQ-T4",
      from: "Aisha Patel",
      dept: "Marketing",
      type: "Trademark Check",
      desc: "Clearance for 'AurorAI' across US and EU",
    });
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
    expect(rec.concerns[0]).toMatch(/AI review unavailable/i);
  });
});

describe("Contract Review agent — real agent degraded fallback", () => {
  it("Claude down → flag-for-review, never auto-send", async () => {
    const rec = await ContractReviewAgent.process({
      id: "REQ-T5",
      from: "Sarah Johnson",
      dept: "Product",
      type: "Contract Review",
      desc: "Review the MSA renewal redlines, liability cap looks off",
    });
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.mock).toBe(true);
    expect(rec.concerns[0]).toMatch(/AI review unavailable/i);
  });
});
