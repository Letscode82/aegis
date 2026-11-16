import { describe, it, expect } from "vitest";
import { renderContractDocx, contractDocxFilename } from "../src/contract-docx";
import { extractDocxText } from "../src/extract";

const DRAFT = [
  "JIO FINANCE – LENDING SERVICE PROVIDER AGREEMENT (RBI DLG)",
  "",
  'This Agreement is executed on {{effectiveDate}} by and between **Jio Finance** and the **Regulated Entity**.',
  "",
  "**1. DEFINITIONS**",
  "",
  '1.1 "Borrower" means a retail customer of the Platform.',
  '1.2 "APR" means the all-inclusive annual percentage rate.',
  "",
  "---",
  "",
  "**2. APPOINTMENT**",
  "",
  "2.1 The RE appoints Jio Finance as a *non-exclusive* Lending Service Provider.",
].join("\n");

describe("renderContractDocx — Markdown body formatting", () => {
  it("renders a valid .docx with the body text and NO literal Markdown marks", async () => {
    const { buffer } = await renderContractDocxWrap();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK"); // zip magic

    const text = await extractDocxText(buffer);
    // Headings and clause text survive…
    expect(text).toContain("DEFINITIONS");
    expect(text).toContain("APPOINTMENT");
    expect(text).toContain("Borrower");
    expect(text).toContain("non-exclusive");
    // …and the raw Markdown emphasis/rule marks are GONE (the bug we fixed).
    expect(text).not.toContain("**");
    expect(text).not.toContain("---");
  });
});

async function renderContractDocxWrap() {
  const buffer = await renderContractDocx({
    contract: {
      id: "ctr_1",
      title: "Jio Finance LSP Agreement",
      type: "CONTRACT",
      status: "DRAFT",
      counterpartyName: "Regulated Entity",
      orgName: "Jio Finance",
      value: 100000,
      currency: "USD",
      effectiveDate: null,
      expiryDate: null,
      governingLaw: "India",
      paymentTerms: null,
      scopeOfServices: null,
      draftText: DRAFT,
    },
    clauses: [],
    generatedAt: "2026-11-16T00:00:00Z",
  });
  return { buffer };
}

describe("contractDocxFilename", () => {
  it("produces a safe filename", () => {
    expect(contractDocxFilename("Jio Finance / LSP!", "DRAFT")).toMatch(/^OneLegal-Jio-Finance-LSP-DRAFT\.docx$/);
  });
});
