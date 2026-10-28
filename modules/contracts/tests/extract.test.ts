import { describe, it, expect } from "vitest";
import { extractContractKnowledge } from "../src/internal/extract";

describe("extractContractKnowledge", () => {
  it("always tracks an attorney-sign-off obligation", () => {
    const { obligations } = extractContractKnowledge("Please review this vendor agreement.", "Master Services Agreement");
    expect(obligations.some((o) => /sign.?off/i.test(o.description))).toBe(true);
  });

  it("surfaces the liability clause and flags an uncapped deviation", () => {
    const { clauses } = extractContractKnowledge(
      "The vendor insists on unlimited liability with no cap on damages.",
      "MSA",
    );
    const liability = clauses.find((c) => c.type === "LIABILITY_CAP");
    expect(liability).toBeTruthy();
    expect(liability?.deviation).toBe(true);
    expect(liability?.risk).toBe("HIGH"); // MEDIUM base bumped by deviation
  });

  it("keeps a within-playbook clause at base risk, no deviation", () => {
    const { clauses } = extractContractKnowledge(
      "Governing law is Delaware. Payment terms are Net 45.",
      "Supply Agreement",
    );
    const law = clauses.find((c) => c.type === "GOVERNING_LAW");
    expect(law?.deviation).toBe(false);
    expect(law?.risk).toBe("LOW");
  });

  it("flags Net 30 payment as a deviation", () => {
    const { clauses } = extractContractKnowledge("Payment due Net 30 from invoice date.", "SOW");
    const pay = clauses.find((c) => c.type === "PAYMENT");
    expect(pay?.deviation).toBe(true);
  });

  it("adds a renewal-notice obligation when auto-renewal is present", () => {
    const { obligations } = extractContractKnowledge(
      "Agreement auto-renews for successive 12-month terms.",
      "MSA",
    );
    expect(obligations.some((o) => /non-renewal notice/i.test(o.description))).toBe(true);
  });

  it("adds a return/destroy obligation for NDAs", () => {
    const { obligations } = extractContractKnowledge("Mutual non-disclosure of proprietary information.", "NDA");
    expect(obligations.some((o) => /return or destroy/i.test(o.description))).toBe(true);
  });

  it("dedupes a clause type mentioned twice", () => {
    const { clauses } = extractContractKnowledge(
      "Liability is capped. Later, liability carve-outs apply.",
      "MSA",
    );
    expect(clauses.filter((c) => c.type === "LIABILITY_CAP")).toHaveLength(1);
  });

  it("uses the real sentence as clause text", () => {
    const { clauses } = extractContractKnowledge(
      "Section 8.2 leaves ownership of derivative works undefined and disputed.",
      "MSA",
    );
    const ip = clauses.find((c) => c.type === "IP");
    expect(ip?.text).toMatch(/Section 8\.2/);
    expect(ip?.deviation).toBe(true);
  });

  it("returns an empty clause set but still an obligation for terse input", () => {
    const { clauses, obligations } = extractContractKnowledge("Need a contract.", "Other");
    expect(clauses).toHaveLength(0);
    expect(obligations.length).toBeGreaterThanOrEqual(1);
  });

  // 2a — the real off-playbook terms a regex-only pass used to miss (NDA-02).
  it("flags a foreign governing law (named country), not just \"foreign\"", () => {
    const { clauses } = extractContractKnowledge("This Agreement is governed by the laws of Germany.", "NDA");
    const law = clauses.find((c) => c.type === "GOVERNING_LAW");
    expect(law?.deviation).toBe(true);
  });

  it("keeps Delaware / NY / CA as non-deviating governing law", () => {
    for (const j of ["Delaware", "New York", "California"]) {
      const { clauses } = extractContractKnowledge(`Governing law is ${j}.`, "NDA");
      expect(clauses.find((c) => c.type === "GOVERNING_LAW")?.deviation, j).toBe(false);
    }
  });

  it("flags confidentiality that survives in perpetuity (not just \"perpetual\")", () => {
    const { clauses } = extractContractKnowledge("Confidentiality obligations survive in perpetuity.", "NDA");
    expect(clauses.find((c) => c.type === "CONFIDENTIALITY")?.deviation).toBe(true);
  });

  it("flags one-sided IP assignment to the disclosing party", () => {
    const { clauses } = extractContractKnowledge("All intellectual property is assigned to the Disclosing Party.", "NDA");
    const ip = clauses.find((c) => c.type === "IP");
    expect(ip?.deviation).toBe(true);
  });

  it("surfaces and flags a residuals clause", () => {
    const { clauses } = extractContractKnowledge("The Receiving Party may use Residuals retained in unaided memory.", "NDA");
    const res = clauses.find((c) => c.type === "RESIDUALS");
    expect(res).toBeTruthy();
    expect(res?.deviation).toBe(true);
  });

  it("a toxic NDA no longer extracts clean — multiple deviations surface", () => {
    const toxic = [
      "This Mutual NDA is governed by the laws of Germany.",
      "Confidentiality obligations shall survive in perpetuity.",
      "All intellectual property is assigned to the Disclosing Party.",
      "The Receiving Party may exploit Residuals retained in unaided memory.",
    ].join(" ");
    const { clauses } = extractContractKnowledge(toxic, "NDA");
    const deviations = clauses.filter((c) => c.deviation);
    expect(deviations.length).toBeGreaterThanOrEqual(3);
  });
});
