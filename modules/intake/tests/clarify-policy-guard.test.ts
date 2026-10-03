import { describe, it, expect } from "vitest";
import { looksLikePolicyDrafting, clarifyIntake } from "../src/clarify/server";

// The deterministic guard that stops a policy/notice drafting request from being
// treated as a privacy DSAR (which would surface the data-subject intake form).
// LAYA_URL is unset under test, so clarifyIntake falls back to the regex
// classifier — fully deterministic.

describe("looksLikePolicyDrafting", () => {
  it("recognises policy / notice drafting requests", () => {
    for (const t of [
      "Draft or update a whistleblower / speak-up policy for: Dr. Reddy's",
      "Draft a data privacy policy for Acme",
      "Prepare a code of conduct for the EU entities",
      "Write a cookie consent notice",
      "Update our anti-bribery policy",
      "Draft a board resolution charter",
    ]) {
      expect(looksLikePolicyDrafting(t), t).toBe(true);
    }
  });

  it("does NOT fire on genuine data-subject requests", () => {
    for (const t of [
      "File a DSAR access request for John Smith",
      "A data subject wants erasure of their personal data",
      "Handle a right to be forgotten request",
      "Process a subject access request",
    ]) {
      expect(looksLikePolicyDrafting(t), t).toBe(false);
    }
  });

  it("does NOT fire on non-drafting or non-policy text", () => {
    for (const t of [
      "Review this vendor MSA for liability risk",
      "Screen Acme Corp for sanctions exposure",
      "How many intake tickets are open?",
    ]) {
      expect(looksLikePolicyDrafting(t), t).toBe(false);
    }
  });
});

describe("clarifyIntake guard", () => {
  it("a privacy-policy drafting request does not ask DSAR questions", async () => {
    // "privacy policy" would classify as Privacy — DPIA / GDPR via regex; the
    // guard drops it to a general inquiry so no data-subject form is shown.
    const r = await clarifyIntake({ text: "Draft a data privacy policy for Acme Corp" });
    expect(r.category).toBe("General Inquiry");
    expect(r.missing).toEqual([]);
  });

  it("a real privacy request still asks the data-subject questions", async () => {
    // Classifies Privacy via the regex "gdpr" / "personal data" triggers, and is
    // not a drafting request — so the guard must NOT fire.
    const r = await clarifyIntake({ text: "We received a GDPR personal-data request and need to respond" });
    expect(r.category).toMatch(/privacy/i);
    const keys = r.missing.map((m) => m.key);
    expect(keys).toContain("dataSubjectName");
    expect(keys).toContain("requestType");
  });

  it("a whistleblower policy draft is never bucketed as privacy", async () => {
    const r = await clarifyIntake({ text: "Draft or update a whistleblower / speak-up policy for: Dr. Reddy's" });
    expect(r.category).not.toMatch(/privacy|dpia|dsar/i);
    expect(r.missing).toEqual([]);
  });
});
