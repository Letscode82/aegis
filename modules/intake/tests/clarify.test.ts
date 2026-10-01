import { describe, it, expect } from "vitest";
import {
  requiredFieldsForCategory,
  extractEntityName,
  extractJurisdiction,
  extractDirection,
  extractDsarType,
  detectIpTransferAmbiguity,
  extractFields,
  computeMissing,
  clarifyIntake,
} from "../src/clarify/server";

describe("requiredFieldsForCategory", () => {
  it("returns the NDA field set", () => {
    const keys = requiredFieldsForCategory("NDA — Standard").map((f) => f.key);
    expect(keys).toEqual(["counterpartyName", "direction", "purpose", "jurisdiction"]);
  });
  it("covers vendor, litigation, privacy, hold families", () => {
    expect(requiredFieldsForCategory("Vendor Contract").map((f) => f.key)).toContain("counterpartyName");
    expect(requiredFieldsForCategory("Litigation — Non-Court").map((f) => f.key)).toContain("summary");
    expect(requiredFieldsForCategory("Privacy — DPIA / GDPR").map((f) => f.key)).toContain("requestType");
    expect(requiredFieldsForCategory("Legal Hold").map((f) => f.key)).toContain("custodians");
  });
  it("returns no fields for an unknown / general category", () => {
    expect(requiredFieldsForCategory("General Inquiry")).toEqual([]);
  });
});

describe("extractors", () => {
  it("extracts an entity with a company suffix", () => {
    expect(extractEntityName("a mutual NDA with Globex Inc for a pilot")).toBe("Globex Inc");
  });
  it("extracts an entity after a linking preposition", () => {
    expect(extractEntityName("litigation against Acme over a breach")).toBe("Acme");
  });
  it("skips stopwords after a preposition", () => {
    expect(extractEntityName("a request for the team")).toBeUndefined();
  });
  it("extracts and normalizes jurisdictions", () => {
    expect(extractJurisdiction("governed by India law")).toBe("India");
    expect(extractJurisdiction("under UK jurisdiction")).toBe("United Kingdom");
    expect(extractJurisdiction("no place named")).toBeUndefined();
  });
  it("extracts NDA direction", () => {
    expect(extractDirection("a mutual nda")).toBe("Mutual");
    expect(extractDirection("a one-way nda")).toBe("One-way (we disclose)");
    expect(extractDirection("an nda")).toBeUndefined();
  });
  it("extracts DSAR request type", () => {
    expect(extractDsarType("right to be forgotten / erasure")).toBe("Erasure");
    expect(extractDsarType("a data access request")).toBe("Access");
  });
  it("detects IP-transfer ambiguity under an NDA", () => {
    expect(detectIpTransferAmbiguity("NDA to sell IP")).toBe(true);
    expect(detectIpTransferAmbiguity("assign all patents")).toBe(true);
    expect(detectIpTransferAmbiguity("a standard mutual NDA")).toBe(false);
  });
});

describe("extractFields + computeMissing", () => {
  it("fills what it can and leaves the rest to ask", () => {
    const fields = requiredFieldsForCategory("NDA — Standard");
    const extracted = extractFields("mutual NDA with Globex Inc, India", fields);
    expect(extracted).toMatchObject({ counterpartyName: "Globex Inc", direction: "Mutual", jurisdiction: "India" });
    const missing = computeMissing(fields, extracted).map((f) => f.key);
    expect(missing).toEqual(["purpose"]); // purpose has no extractor → always asked
  });
});

describe("clarifyIntake (regex classification path; Laya disabled in test)", () => {
  it("returns only the genuinely-missing fields for a clean NDA", async () => {
    const r = await clarifyIntake({ text: "draft a mutual NDA with Globex Inc governed by Delaware" });
    expect(r.category).toMatch(/nda/i);
    expect(r.extracted).toMatchObject({ counterpartyName: "Globex Inc", direction: "Mutual", jurisdiction: "Delaware" });
    expect(r.missing.map((f) => f.key)).toEqual(["purpose"]);
  });
  it("adds a document-type confirmation when an NDA smells like an IP transfer", async () => {
    const r = await clarifyIntake({ text: "file an NDA with Harsha Inc to sell IP, India" });
    expect(r.category).toMatch(/nda/i);
    expect(r.missing[0]?.key).toBe("docType");
    expect(r.missing.map((f) => f.key)).toContain("purpose");
  });
  it("asks nothing for a general inquiry", async () => {
    const r = await clarifyIntake({ text: "what is our standard retention period?" });
    expect(r.missing).toEqual([]);
  });
});
