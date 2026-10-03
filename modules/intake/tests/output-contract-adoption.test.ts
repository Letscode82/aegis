/**
 * SK-4 — the eleven intake agents converge on the AEGIS shared output
 * contract (@aegis/legal-skills): every recommendation carries an `overall`
 * severity on the one S1–S4/Info scale plus structured `findings`. These
 * tests cover the three convergence seams: buildRec normalisation, the oKF
 * JSON path carrying a model's severity, and the triage-risk fallback that
 * stamps a severity when an agent didn't assess one itself.
 */
import { describe, expect, it } from "vitest";
import { buildRec, buildDegradedRec, severityFromTriageRiskFlag } from "../src/agents/build-rec";
import { runDefinition } from "../src/agents/okf/runtime";

describe("severityFromTriageRiskFlag", () => {
  it("maps the leading risk word of a triage riskFlag to the shared scale", () => {
    expect(severityFromTriageRiskFlag("Critical — board deadline")).toBe("S1");
    expect(severityFromTriageRiskFlag("High — client-facing")).toBe("S2");
    expect(severityFromTriageRiskFlag("Medium — deep review needed")).toBe("S3");
    expect(severityFromTriageRiskFlag("Low — routine clearance")).toBe("S4");
    expect(severityFromTriageRiskFlag("None — 100% template match")).toBe("Info");
  });

  it("picks the MOST severe word in a compound flag (Low-Medium → S3)", () => {
    expect(severityFromTriageRiskFlag("Low-Medium — Vietnam vendor")).toBe("S3");
  });

  it("returns null for empty / unknown flags", () => {
    expect(severityFromTriageRiskFlag("")).toBeNull();
    expect(severityFromTriageRiskFlag(undefined as unknown as string)).toBeNull();
    expect(severityFromTriageRiskFlag("Spicy — unknown word")).toBeNull();
  });
});

describe("buildRec — shared output-contract fields", () => {
  it("normalises an explicit overall (legacy risk word → S-level)", () => {
    const rec = buildRec("contract-review-agent", {
      confidence: 0.9,
      suggestedAction: "flag-for-review",
      draftedResponse: "x",
      reasoning: "y",
      overall: "critical",
    });
    expect(rec.overall).toBe("S1");
    expect(rec.findings).toEqual([]);
  });

  it("rolls overall up from findings when no explicit overall is given", () => {
    const rec = buildRec("contract-review-agent", {
      confidence: 0.8,
      suggestedAction: "flag-for-review",
      draftedResponse: "x",
      reasoning: "y",
      findings: [{ severity: "S3", title: "a" }, { severity: "S1", title: "b" }],
    });
    expect(rec.overall).toBe("S1");
    expect(rec.findings).toHaveLength(2);
    expect(rec.findings[0].id).toBe("F1"); // coerced to the contract shape
  });

  it("leaves overall null when the agent assessed no severity", () => {
    const rec = buildRec("faq-agent", {
      confidence: 0.9,
      suggestedAction: "approve-and-send",
      draftedResponse: "x",
      reasoning: "y",
    });
    expect(rec.overall).toBeNull();
    expect(rec.findings).toEqual([]);
  });

  it("degraded recs are never auto-rated (overall stays null)", () => {
    const rec = buildDegradedRec("nda-agent", { draftedResponse: "", reasoning: "down", concerns: [] });
    expect(rec.overall).toBeNull();
    expect(rec.mock).toBe(true);
  });
});

describe("oKF runtime — carries the model's severity onto the contract", () => {
  const doc = {
    agent: {
      key: "contract-review-agent",
      prompt: { mode: "json", systemTemplate: "sys {{ticket.desc}}", jsonContract: "contract" },
      output: { autoSendAtConfidence: 0.85, defaultAction: "flag-for-review", autoSendAction: "approve-and-send" },
      model: {},
    },
  };
  const ticket = { id: "t1", from: "Dana", desc: "review this MSA", aiTriage: { riskFlag: "Medium — deep review" } };

  it("normalises model overall + findings from the JSON path", async () => {
    const deps = {
      callClaudeJSON: async () => ({
        draftedResponse: "review",
        confidence: 0.9,
        reasoning: "basis",
        overall: "high",
        findings: [{ severity: "critical", category: "liability", title: "uncapped indemnity" }],
      }),
      callClaude: async () => "should not be called",
      buildRec,
      buildDegradedRec,
      friendlyAIError: (e: unknown) => String(e),
    };
    const rec = await runDefinition(ticket, doc, [], deps);
    expect(rec.overall).toBe("S2");
    expect(rec.findings[0].severity).toBe("S1");
    expect(rec.findings[0].category).toBe("liability");
  });

  it("degrades to a null-severity rec when the model is unavailable", async () => {
    const deps = {
      callClaudeJSON: async () => { throw new Error("down"); },
      callClaude: async () => { throw new Error("down"); },
      buildRec,
      buildDegradedRec,
      friendlyAIError: (e: unknown) => String(e),
    };
    const rec = await runDefinition(ticket, doc, [], deps);
    expect(rec.overall).toBeNull();
    expect(rec.mock).toBe(true);
  });
});
