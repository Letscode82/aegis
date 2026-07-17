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
});
