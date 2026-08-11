import { describe, it, expect } from "vitest";
import {
  computeContractTermsHash,
  contractTermsCanonical,
  assertContractEditable,
  ContractLockedError,
  MATERIAL_TERM_FIELDS,
  LOCKED_STATUSES,
} from "../src/internal/integrity";
import type { ContractTermsInput } from "../src/internal/integrity";

const base: ContractTermsInput = {
  type: "MSA",
  value: 100000,
  currency: "USD",
  paymentTerms: "Net 45",
  effectiveDate: new Date("2026-01-01T00:00:00Z"),
  expiryDate: new Date("2027-01-01T00:00:00Z"),
  governingLaw: "Delaware",
  scopeOfServices: "Managed services",
  draftText: "The parties agree…",
  clauses: [
    { type: "LIABILITY_CAP", text: "Cap at fees", risk: "HIGH", deviation: true },
    { type: "PAYMENT", text: "Net 45", risk: "LOW", deviation: false },
  ],
};

describe("computeContractTermsHash — deterministic fingerprint", () => {
  it("is stable for identical terms", () => {
    expect(computeContractTermsHash(base)).toBe(computeContractTermsHash(structuredClone(base)));
  });

  it("is invariant to clause ordering", () => {
    const reordered = { ...base, clauses: [...base.clauses].reverse() };
    expect(computeContractTermsHash(reordered)).toBe(computeContractTermsHash(base));
  });

  it("CHANGES when the value (pricing) changes — the fraud vector", () => {
    const tampered = { ...base, value: 500000 };
    expect(computeContractTermsHash(tampered)).not.toBe(computeContractTermsHash(base));
  });

  it("changes when payment terms, scope, or a clause changes", () => {
    expect(computeContractTermsHash({ ...base, paymentTerms: "Net 30" })).not.toBe(computeContractTermsHash(base));
    expect(computeContractTermsHash({ ...base, scopeOfServices: "Different" })).not.toBe(computeContractTermsHash(base));
    expect(computeContractTermsHash({ ...base, clauses: [{ type: "LIABILITY_CAP", text: "Uncapped", risk: "HIGH", deviation: true }] })).not.toBe(computeContractTermsHash(base));
  });

  it("produces a 64-char hex SHA-256", () => {
    expect(computeContractTermsHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canonical form is valid, parseable JSON", () => {
    expect(() => JSON.parse(contractTermsCanonical(base))).not.toThrow();
  });
});

describe("assertContractEditable — the executed-contract lock", () => {
  it("throws ContractLockedError when a material field changes on an executed contract", () => {
    for (const status of LOCKED_STATUSES) {
      expect(() => assertContractEditable({ status }, ["value"])).toThrow(ContractLockedError);
    }
  });

  it("allows edits when NO material field changed (empty list)", () => {
    expect(() => assertContractEditable({ status: "EXECUTED" }, [])).not.toThrow();
  });

  it("allows material edits on pre-execution states", () => {
    expect(() => assertContractEditable({ status: "DRAFT" }, ["value"])).not.toThrow();
    expect(() => assertContractEditable({ status: "IN_REVIEW" }, ["paymentTerms"])).not.toThrow();
  });

  it("the error carries the offending fields", () => {
    try {
      assertContractEditable({ status: "ACTIVE" }, ["value", "paymentTerms"]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ContractLockedError);
      expect((e as ContractLockedError).fields).toEqual(["value", "paymentTerms"]);
    }
  });
});

describe("MATERIAL_TERM_FIELDS", () => {
  it("covers the fraud-relevant commercial terms", () => {
    for (const f of ["value", "currency", "paymentTerms", "scopeOfServices"]) {
      expect(MATERIAL_TERM_FIELDS).toContain(f);
    }
  });
});
