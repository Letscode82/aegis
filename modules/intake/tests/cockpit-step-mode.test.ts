/**
 * PR-C — adaptive Cockpit: the step-mode inference that decides what the
 * Cockpit leads with for the ladder's current step.
 */
import { describe, it, expect } from "vitest";
import { stepModeFor } from "../src/intake/cockpit-step-panel.jsx";

describe("stepModeFor — Cockpit adapts to the ladder's current step", () => {
  it("AGENT steps are always agent mode (regardless of screenKey)", () => {
    expect(stepModeFor({ kind: "AGENT", screenKey: "agent_review" })).toBe("agent");
    expect(stepModeFor({ kind: "AGENT", screenKey: "whatever" })).toBe("agent");
  });

  it("human intake / draft / upload screens are deep-work mode", () => {
    for (const k of ["nda_intake", "contract_draft", "litigation_intake", "signature_upload", "matter_docket", "compose_notice"]) {
      expect(stepModeFor({ kind: "HUMAN", screenKey: k })).toBe("work");
    }
  });

  it("human review / sign-off gates default to approve mode", () => {
    for (const k of ["legal_review", "gc_approval", "finance_review", "board_signoff", "ip_assessment", "antitrust_review", "signature_screen"]) {
      expect(stepModeFor({ kind: "HUMAN", screenKey: k })).toBe("approve");
    }
  });

  it("a null / missing step is mode none", () => {
    expect(stepModeFor(null)).toBe("none");
    expect(stepModeFor(undefined)).toBe("none");
  });
});
