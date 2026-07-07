/**
 * Agent 7 · Privacy Assessment + Agent 8 · Marketing Review —
 * deterministic signal cores, escalation gates, routing lanes, and
 * degraded-path invariants.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  friendlyAIError: (e: unknown) => `AI unavailable: ${String(e)}`,
}));
vi.mock("../src/storage/agent-log", () => ({ appendAgentLog: vi.fn() }));

const {
  detectDataCategories, detectTransfer, detectNovelTech,
  regimeTriggers, gapsList, assessPrivacyRisk,
} = await import("../src/agents/privacy-signals");
const { scanClaims, matchLibraryClaims, routeMarketingReview } = await import("../src/agents/claims-signals");
const { PrivacyAssessmentAgent } = await import("../src/agents/privacy-assessment");
const { MarketingReviewAgent } = await import("../src/agents/marketing-review");
const { FAQAgent } = await import("../src/agents/faq");
const { routeToAgent } = await import("../src/agents/index");

const base = { id: "p1", from: "Dana Lee", dept: "Product" };

beforeEach(() => {
  callClaudeJSONMock.mockReset().mockResolvedValue({
    draftedResponse: "Assessment text.",
    alternativeTone: "one line",
    confidence: 0.8,
    reasoning: "test",
  });
});

// ── Agent 7 deterministic core ──────────────────────────────────────

describe("privacy-signals", () => {
  it("detects categories with citations and ranks sensitive/children as HIGH + escalate", () => {
    const cats = detectDataCategories("New telehealth app processing patient health records");
    expect(cats.some((c) => c.category === "sensitive")).toBe(true);
    const risk = assessPrivacyRisk({
      categories: cats,
      transfer: { flag: false }, novelTech: { flag: false }, highVolume: { flag: false },
    });
    expect(risk.rating).toBe("HIGH");
    expect(risk.mustEscalate).toBe(true);
  });

  it("cross-border transfer and AI both escalate even without sensitive data", () => {
    const transfer = detectTransfer("customer data will be transferred to the US for analytics");
    expect(transfer.flag).toBe(true);
    const novel = detectNovelTech("we will run an ML model for profiling");
    expect(novel.flag).toBe(true);
    const risk = assessPrivacyRisk({
      categories: [{ category: "personal", label: "x", matched: "customer data" }],
      transfer, novelTech: novel, highVolume: { flag: false },
    });
    expect(risk.mustEscalate).toBe(true);
    expect(risk.rating).toBe("MEDIUM");
  });

  it("regime triggers select by jurisdiction; unknown → verify-applicability defaults", () => {
    expect(regimeTriggers("users in India").some((r) => /DPDP/.test(r.regime) && r.certain)).toBe(true);
    expect(regimeTriggers("customers in Germany").some((r) => /GDPR/.test(r.regime) && r.certain)).toBe(true);
    expect(regimeTriggers("a new tool").every((r) => !r.certain)).toBe(true);
  });

  it("gaps list reports what the description did not cover", () => {
    const gaps = gapsList("We want to collect customer emails.");
    expect(gaps.some((g) => /Retention/.test(g))).toBe(true);
    expect(gaps.some((g) => /jurisdiction/i.test(g))).toBe(true);
  });
});

describe("PrivacyAssessmentAgent", () => {
  it("escalates sensitive-category processing with cited evidence + gaps", async () => {
    const rec = (await PrivacyAssessmentAgent.process({
      ...base, type: "Privacy Review",
      desc: "Launching a wellness portal storing employee health records",
    })) as { suggestedAction: string; concerns: string[] };
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.concerns.some((c) => /Sensitive/.test(c) && /matched/.test(c))).toBe(true);
    expect(rec.concerns.some((c) => /GAPS/.test(c))).toBe(true);
  });

  it("degraded path keeps rating, flags, regimes, and gaps", async () => {
    callClaudeJSONMock.mockRejectedValue(new Error("boom"));
    const rec = (await PrivacyAssessmentAgent.process({
      ...base, type: "Privacy Review",
      desc: "Processing customer data with cross-border transfer to the US",
    })) as { suggestedAction: string; confidence: number; draftedResponse: string; concerns: string[] };
    expect(rec.suggestedAction).toBe("flag-for-review"); // degraded invariant
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.draftedResponse).toContain("Risk rating");
    expect(rec.concerns.some((c) => /Cross-border/.test(c))).toBe(true);
  });

  it("plain policy questions stay with the FAQ agent (routing lane)", () => {
    const q = { ...base, type: "Legal Question — General", desc: "What is our data retention period for customer data?" };
    expect(PrivacyAssessmentAgent.canHandle(q)).toBe(false);
    expect(routeToAgent(q, undefined)).toBe(FAQAgent);
  });

  it("assessment requests route to the privacy agent", () => {
    expect(routeToAgent({ ...base, type: "General", desc: "Need a DPIA for our new analytics vendor processing personal data" }, undefined))
      .toBe(PrivacyAssessmentAgent);
  });
});

// ── Agent 8 deterministic core ──────────────────────────────────────

describe("claims-signals", () => {
  it("regulated/therapeutic claims force full review (escalate), never agent-cleared", () => {
    const signals = scanClaims("Our supplement cures fatigue and is clinically proven");
    expect(signals.some((s) => s.kind === "regulated")).toBe(true);
    expect(routeMarketingReview(signals)).toEqual({ route: "full-review", action: "escalate" });
  });

  it("HCP-facing material forces full review even without regulated wording", () => {
    const signals = scanClaims("Conference booth handout for the cardiology congress");
    expect(routeMarketingReview(signals).route).toBe("full-review");
  });

  it("superlatives route to revise; clean copy routes to fast-track", () => {
    expect(routeMarketingReview(scanClaims("We are the fastest platform, guaranteed")).route).toBe("revise");
    expect(routeMarketingReview(scanClaims("New logo rollout on our website banner")).route).toBe("fast-track");
  });

  it("library-verbatim matches are found case-insensitively", () => {
    expect(matchLibraryClaims("Copy says we are ISO 27001 certified with 24/7 customer support")).toHaveLength(2);
  });
});

describe("MarketingReviewAgent", () => {
  it("escalates regulated claims with the matched text cited", async () => {
    const rec = (await MarketingReviewAgent.process({
      ...base, dept: "Marketing", type: "Marketing Review",
      desc: "Ad copy: our device prevents infections, FDA-approved",
    })) as { suggestedAction: string; concerns: string[] };
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.concerns.some((c) => /MANDATORY human review/.test(c))).toBe(true);
  });

  it("degraded path keeps the scan + route", async () => {
    callClaudeJSONMock.mockRejectedValue(new Error("boom"));
    const rec = (await MarketingReviewAgent.process({
      ...base, dept: "Marketing", type: "Marketing Review",
      desc: "Social media campaign: the best platform, #1 in the market",
    })) as { suggestedAction: string; concerns: string[]; confidence: number };
    expect(rec.suggestedAction).toBe("flag-for-review"); // degraded invariant
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.concerns.some((c) => /Superlative/.test(c))).toBe(true);
  });

  it("routing: marketing copy goes to Marketing; trademark clearance stays with Trademark", () => {
    expect(routeToAgent({ ...base, dept: "Marketing", type: "General", desc: "Please review the promotional material for the spring campaign" }, undefined))
      .toBe(MarketingReviewAgent);
    const tm = routeToAgent({ ...base, dept: "Marketing", type: "Trademark Check", desc: 'Trademark clearance for "Zephyrion" in US and EU' }, undefined);
    expect(tm?.id).toBe("trademark-agent");
  });
});
