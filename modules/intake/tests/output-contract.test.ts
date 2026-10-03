/**
 * SK-4 — every oKF recommendation emits the shared AEGIS output contract
 * (S1–S4 severity + the JSON shape every @aegis/legal-skills playbook speaks).
 * This is additive and must never weaken the human gate: review status stays
 * "draft", and a flag-for-review rec always escalates.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — build-rec is plain JS without types.
import { buildRec, buildDegradedRec } from "../src/agents/build-rec";

describe("buildRec attaches the shared output contract", () => {
  it("maps concerns to severity-ranked findings with a derived overall", () => {
    const rec = buildRec("contract-review-agent", {
      confidence: 0.9,
      suggestedAction: "flag-for-review",
      reasoning: "MSA has an uncapped indemnity. Also a minor drafting nit.",
      concerns: ["Uncapped indemnity for data breach", "Minor typo in recitals"],
    }) as { outputContract: any };
    const c = rec.outputContract;
    expect(c.$schema).toMatch(/aegis\.output-contract\.v\d+/);
    expect(c.skill).toBe("okf/contract-review-agent");
    expect(c.findings[0].severity).toBe("S1"); // highest first
    expect(c.overall).toBe("S1");
    expect(c.escalation.required).toBe(true);
    expect(c.review.status).toBe("draft");
    expect(c.findings.every((f: any) => f.confidence === "high")).toBe(true);
  });

  it("flag-for-review escalates even with no blocking finding", () => {
    const rec = buildRec("faq-agent", {
      confidence: 0.8,
      suggestedAction: "flag-for-review",
      reasoning: "General question.",
      concerns: ["General commercial point to weigh"],
    }) as { outputContract: any };
    expect(rec.outputContract.overall).toBe("S3");
    expect(rec.outputContract.escalation.required).toBe(true);
  });

  it("a clean rec with no concerns has no overall and does not escalate", () => {
    const rec = buildRec("faq-agent", {
      confidence: 0.9,
      suggestedAction: "approve-and-send",
      reasoning: "Answered from the policy.",
      concerns: [],
    }) as { outputContract: any };
    expect(rec.outputContract.overall).toBeNull();
    expect(rec.outputContract.escalation.required).toBe(false);
    expect(rec.outputContract.findings).toEqual([]);
  });

  it("degraded recs carry the contract at low confidence and escalate", () => {
    const rec = buildDegradedRec("nda-agent", { reasoning: "Template draft.", concerns: [] }) as {
      outputContract: any; confidence: number; suggestedAction: string;
    };
    expect(rec.suggestedAction).toBe("flag-for-review");
    expect(rec.confidence).toBeLessThanOrEqual(0.4);
    expect(rec.outputContract.escalation.required).toBe(true);
    expect(rec.outputContract.review.status).toBe("draft");
    // the degraded lead concern becomes a finding
    expect(rec.outputContract.findings.length).toBeGreaterThan(0);
    expect(rec.outputContract.findings.every((f: any) => f.confidence === "low")).toBe(true);
  });
});
