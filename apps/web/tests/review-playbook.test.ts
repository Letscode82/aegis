import { describe, it, expect } from "vitest";
import {
  preferredReviewSkill,
  playbookLabelFor,
  playbookDirective,
  normalizeJurisdiction,
  jurisdictionLabel,
  jurisdictionDirective,
  DEFAULT_JURISDICTION,
  orgPlaybookPromptBlock,
  ORG_PLAYBOOK_LABEL,
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
  it("points at the skill's checks by default", () => {
    expect(playbookDirective("X").toLowerCase()).toContain("position checks in the skill above");
  });
  it("points at the Organization Contract Playbook when org-configured", () => {
    const d = playbookDirective(ORG_PLAYBOOK_LABEL, { orgConfigured: true });
    expect(d).toContain("Organization Contract Playbook included above");
    expect(d).toContain(ORG_PLAYBOOK_LABEL);
  });
});

// #2 — the review scores against the org's OWN editable Contracts Playbook (the
// contract-clauses knowledge pack) when it has one; empty falls back to the
// skill's built-in positions.
describe("orgPlaybookPromptBlock", () => {
  it("returns empty for a blank/absent org playbook (falls back to skill positions)", () => {
    expect(orgPlaybookPromptBlock(undefined)).toBe("");
    expect(orgPlaybookPromptBlock("")).toBe("");
    expect(orgPlaybookPromptBlock("   \n  ")).toBe("");
  });
  it("wraps a configured playbook as an authoritative, overriding block", () => {
    const block = orgPlaybookPromptBlock("- Liability cap (LIAB): 12 months fees.");
    expect(block).toContain("Organization Contract Playbook");
    expect(block).toContain("AUTHORITATIVE");
    expect(block).toContain("Liability cap (LIAB): 12 months fees.");
  });
});

// US-first: the review defaults to the US baseline and the toggle anchors it to
// a market, so an empty/unknown jurisdiction never reverts to the skills'
// India-anchored defaults.
describe("normalizeJurisdiction", () => {
  it("defaults to US when nothing is supplied", () => {
    expect(DEFAULT_JURISDICTION).toBe("US");
    expect(normalizeJurisdiction(undefined)).toBe("US");
    expect(normalizeJurisdiction("")).toBe("US");
    expect(normalizeJurisdiction("   ")).toBe("US");
  });
  it("upper-cases and passes known codes through", () => {
    expect(normalizeJurisdiction("us")).toBe("US");
    expect(normalizeJurisdiction("eu")).toBe("EU");
    expect(normalizeJurisdiction("Global")).toBe("GLOBAL");
  });
  it("keeps an unknown code (upper-cased) rather than dropping it", () => {
    expect(normalizeJurisdiction("ca")).toBe("CA");
  });
});

describe("jurisdictionLabel", () => {
  it("names the known jurisdictions", () => {
    expect(jurisdictionLabel("US")).toBe("United States");
    expect(jurisdictionLabel("eu")).toBe("European Union");
    expect(jurisdictionLabel("GLOBAL")).toBe("Jurisdiction-neutral");
  });
});

describe("jurisdictionDirective", () => {
  it("defaults to a US baseline with US-state privacy deadlines, not GDPR", () => {
    const d = jurisdictionDirective(undefined);
    expect(d).toContain("United States");
    expect(d).toContain("CCPA/CPRA");
    expect(d).toContain("45 days");
    expect(d).toContain("NOT GDPR");
  });
  it("uses GDPR's one-month clock for the EU", () => {
    const d = jurisdictionDirective("EU");
    expect(d).toContain("GDPR");
    expect(d).toContain("one month");
  });
  it("names the jurisdiction it is anchoring to", () => {
    expect(jurisdictionDirective("UK")).toContain("United Kingdom");
    expect(jurisdictionDirective("IN")).toContain("India");
  });
});
