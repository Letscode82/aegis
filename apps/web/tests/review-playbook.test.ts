import { describe, it, expect } from "vitest";
import {
  preferredReviewSkill,
  playbookLabelFor,
  playbookDirective,
} from "../lib/one-legal/review-playbook";

// Playbook-first review: an NDA must be scored against the NDA playbook (not the
// generic commercial-contract playbook — the F2 mis-route), and the review must
// never hedge that "no playbook was provided."

describe("preferredReviewSkill", () => {
  it("routes an NDA to nda-triage from the filename", () => {
    expect(preferredReviewSkill("NDA-02_deviations_flagged.docx", "", "")).toBe("contracts/nda-triage");
  });

  it("routes from common NDA phrasings in the body", () => {
    for (const body of [
      "MUTUAL NON-DISCLOSURE AGREEMENT between A and B",
      "This Confidentiality Agreement is entered into…",
      "NONDISCLOSURE AGREEMENT",
      "Mutual Confidential Disclosure Agreement",
    ]) {
      expect(preferredReviewSkill("doc.docx", body, "")).toBe("contracts/nda-triage");
    }
  });

  it("routes from the task text when the doc is unnamed", () => {
    expect(preferredReviewSkill("", "", "review this NDA against the playbook")).toBe("contracts/nda-triage");
  });

  it("returns null for a non-NDA document, leaving normal routing to decide", () => {
    expect(preferredReviewSkill("MSA_vortex.docx", "MASTER SERVICES AGREEMENT", "review this services agreement")).toBeNull();
  });

  it("does not false-positive on an unrelated mention deep in the body", () => {
    const body = "Services Agreement.\n" + "x".repeat(5000) + "\nthe parties previously signed a non-disclosure agreement";
    expect(preferredReviewSkill("services.docx", body, "")).toBeNull();
  });
});

describe("playbookLabelFor", () => {
  it("names the NDA and contract playbooks", () => {
    expect(playbookLabelFor("contracts/nda-triage")).toBe("AEGIS Standard NDA Playbook");
    expect(playbookLabelFor("contracts/contract-review")).toBe("AEGIS Standard Contract Playbook");
  });

  it("falls back to the skill title for other skills", () => {
    expect(playbookLabelFor("privacy/dpa-review", "DPA Review")).toBe("AEGIS DPA Review Playbook");
    expect(playbookLabelFor("x/y")).toBe("AEGIS Standard Playbook");
  });
});

describe("playbookDirective", () => {
  it("names the playbook and forbids the missing-playbook hedge", () => {
    const d = playbookDirective("AEGIS Standard NDA Playbook");
    expect(d).toContain("AEGIS Standard NDA Playbook");
    expect(d).toContain("AUTHORITATIVE");
    expect(d.toLowerCase()).toContain("do not say that a playbook");
  });
});
