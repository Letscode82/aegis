import { describe, it, expect } from "vitest";
import { assembleContractBody, type LibraryClause } from "../src/internal/clause-insertion";

const LIB: Record<string, LibraryClause> = {
  LIABILITY_CAP: {
    clauseType: "LIABILITY_CAP",
    title: "Limitation of Liability",
    standardText: "Liability is capped at fees paid in the prior 12 months.",
    fallbackText: "Liability is capped at 2x fees paid in the prior 12 months.",
  },
  CONFIDENTIALITY: {
    clauseType: "CONFIDENTIALITY",
    title: "Confidentiality",
    standardText: "Each party keeps the other's Confidential Information secret for 3 years.",
    fallbackText: null,
  },
  GOVERNING_LAW: {
    clauseType: "GOVERNING_LAW",
    title: "Governing Law",
    standardText: "Governed by the laws of {{contract.governingLaw}}.",
    fallbackText: null,
  },
};

describe("assembleContractBody — marker resolution", () => {
  it("inserts a clause's standard text at a {{clause:CODE}} marker", () => {
    const r = assembleContractBody("A. {{clause:LIABILITY_CAP}}\nB. Term.", LIB);
    expect(r.body).toBe("A. Liability is capped at fees paid in the prior 12 months.\nB. Term.");
    expect(r.inserted).toEqual([
      { clauseType: "LIABILITY_CAP", title: "Limitation of Liability", variant: "standard", source: "placeholder" },
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it("inserts the fallback text when the |fallback variant is requested", () => {
    const r = assembleContractBody("{{clause:LIABILITY_CAP|fallback}}", LIB);
    expect(r.body).toBe("Liability is capped at 2x fees paid in the prior 12 months.");
    expect(r.inserted[0].variant).toBe("fallback");
  });

  it("falls back to standard text (honestly) when a fallback is asked for but none exists", () => {
    const r = assembleContractBody("{{clause:CONFIDENTIALITY|fallback}}", LIB);
    expect(r.body).toContain("keeps the other's Confidential Information secret");
    expect(r.inserted[0].variant).toBe("standard");
  });

  it("is case-insensitive on the code and tolerates whitespace", () => {
    const r = assembleContractBody("{{ clause: liability_cap }}", LIB);
    expect(r.inserted[0].clauseType).toBe("LIABILITY_CAP");
    expect(r.unresolved).toEqual([]);
  });

  it("leaves an unknown code verbatim and reports it as unresolved", () => {
    const r = assembleContractBody("X {{clause:INDEMNITY}} Y", LIB);
    expect(r.body).toBe("X {{clause:INDEMNITY}} Y");
    expect(r.inserted).toEqual([]);
    expect(r.unresolved).toEqual(["INDEMNITY"]);
  });

  it("preserves {{variable}} placeholders inside inserted clause text", () => {
    const r = assembleContractBody("{{clause:GOVERNING_LAW}}", LIB);
    expect(r.body).toBe("Governed by the laws of {{contract.governingLaw}}.");
  });
});

describe("assembleContractBody — appended selections", () => {
  it("appends a selected clause to the end when no {{clauses}} slot exists", () => {
    const r = assembleContractBody("Preamble.", LIB, [{ clauseType: "CONFIDENTIALITY" }]);
    expect(r.body).toBe(
      "Preamble.\n\nConfidentiality\nEach party keeps the other's Confidential Information secret for 3 years.\n",
    );
    expect(r.inserted).toEqual([
      { clauseType: "CONFIDENTIALITY", title: "Confidentiality", variant: "standard", source: "appended" },
    ]);
  });

  it("drops appended clauses into a {{clauses}} slot when present", () => {
    const r = assembleContractBody("Head.\n{{clauses}}\nTail.", LIB, [{ clauseType: "CONFIDENTIALITY" }]);
    expect(r.body).toBe(
      "Head.\nConfidentiality\nEach party keeps the other's Confidential Information secret for 3 years.\nTail.",
    );
  });

  it("removes an unused {{clauses}} slot rather than leaking it into the draft", () => {
    const r = assembleContractBody("Head.\n{{clauses}}\nTail.", LIB);
    expect(r.body).toBe("Head.\n\nTail.");
  });

  it("does not double-insert a clause already placed by a marker", () => {
    const r = assembleContractBody("{{clause:LIABILITY_CAP}}", LIB, [{ clauseType: "LIABILITY_CAP", variant: "fallback" }]);
    expect(r.inserted).toHaveLength(1);
    expect(r.inserted[0].source).toBe("placeholder");
    expect(r.body).toBe("Liability is capped at fees paid in the prior 12 months.");
  });

  it("dedups repeated selections of the same type", () => {
    const r = assembleContractBody("P.", LIB, [{ clauseType: "CONFIDENTIALITY" }, { clauseType: "CONFIDENTIALITY" }]);
    expect(r.inserted).toHaveLength(1);
  });

  it("reports an unknown selected type as unresolved and skips it", () => {
    const r = assembleContractBody("P.", LIB, [{ clauseType: "NON_SOLICIT" }]);
    expect(r.inserted).toEqual([]);
    expect(r.unresolved).toEqual(["NON_SOLICIT"]);
    expect(r.body).toBe("P.");
  });

  it("appends multiple selections in order, separated by a blank line", () => {
    const r = assembleContractBody("P.", LIB, [{ clauseType: "LIABILITY_CAP" }, { clauseType: "CONFIDENTIALITY" }]);
    expect(r.inserted.map((c) => c.clauseType)).toEqual(["LIABILITY_CAP", "CONFIDENTIALITY"]);
    expect(r.body).toContain("Limitation of Liability\nLiability is capped");
    expect(r.body).toContain("\n\nConfidentiality\n");
  });
});

describe("assembleContractBody — edge cases", () => {
  it("returns an empty body unchanged with no insertions", () => {
    expect(assembleContractBody("", LIB)).toEqual({ body: "", inserted: [], unresolved: [] });
  });

  it("handles an empty library (every marker unresolved)", () => {
    const r = assembleContractBody("{{clause:LIABILITY_CAP}}", {});
    expect(r.body).toBe("{{clause:LIABILITY_CAP}}");
    expect(r.unresolved).toEqual(["LIABILITY_CAP"]);
  });

  it("resolves multiple distinct markers independently", () => {
    const r = assembleContractBody("1 {{clause:LIABILITY_CAP}} 2 {{clause:CONFIDENTIALITY}}", LIB);
    expect(r.inserted.map((c) => c.clauseType)).toEqual(["LIABILITY_CAP", "CONFIDENTIALITY"]);
    expect(r.body).toBe(
      "1 Liability is capped at fees paid in the prior 12 months. 2 Each party keeps the other's Confidential Information secret for 3 years.",
    );
  });
});
