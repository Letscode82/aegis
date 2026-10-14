/**
 * Whole-contract version redline renderer (CLM Stage 3) — flattens a clause
 * diff into ONE tracked-changes .docx: a heading per changed/added/removed
 * clause, real `<w:ins>` / `<w:del>` revisions beneath, and document-unique
 * revision ids threaded across clauses.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  renderContractRedlineDocx,
  contractRedlineDocxFilename,
  type ContractRedlineClause,
} from "../src/index";

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

const CLAUSES: ContractRedlineClause[] = [
  {
    label: "Liability cap",
    status: "changed",
    segments: [
      { type: "equal", text: "Liability shall be capped at " },
      { type: "delete", text: "$1,000,000" },
      { type: "insert", text: "$5,000,000" },
      { type: "equal", text: "." },
    ],
  },
  { label: "Arbitration", status: "added", segments: [{ type: "insert", text: "Disputes resolved under AAA rules." }] },
  { label: "Indemnity", status: "removed", segments: [{ type: "delete", text: "Broad indemnity in favor of counterparty." }] },
];

describe("renderContractRedlineDocx", () => {
  it("emits real tracked-changes markup for every changed/added/removed clause", async () => {
    const buf = await renderContractRedlineDocx({
      title: "MSA — Acme Robotics",
      fromVersion: 2,
      toVersion: 3,
      counts: { added: 1, removed: 1, changed: 1, unchanged: 4 },
      clauses: CLAUSES,
      generatedAt: "2026-10-14T00:00:00.000Z",
      generatedBy: "Harsha",
    });
    const xml = await documentXml(buf);
    expect(xml).toContain("<w:ins");
    expect(xml).toContain("<w:del");
    expect(xml).toContain("$1,000,000"); // deleted text preserved
    expect(xml).toContain("$5,000,000"); // inserted text preserved
    expect(xml).toContain("AAA rules"); // added clause as insertion
    expect(xml).toContain("Broad indemnity"); // removed clause as deletion
    // Clause headings with status tags.
    expect(xml).toContain("CHANGED");
    expect(xml).toContain("ADDED");
    expect(xml).toContain("REMOVED");
    // Revision author defaults; the requester shows in the footer.
    expect(xml).toContain('w:author="OneLegal Redline"');
    expect(xml).toContain("requested by Harsha");
    expect(xml).toContain("4 unchanged");
  });

  it("threads unique revision ids across clauses (no duplicate w:id)", async () => {
    const buf = await renderContractRedlineDocx({
      title: "Doc",
      fromVersion: 1,
      toVersion: 2,
      counts: { added: 0, removed: 0, changed: 2, unchanged: 0 },
      clauses: [
        { label: "A", status: "changed", segments: [{ type: "delete", text: "old a" }, { type: "insert", text: "new a" }] },
        { label: "B", status: "changed", segments: [{ type: "delete", text: "old b" }, { type: "insert", text: "new b" }] },
      ],
      generatedAt: "2026-10-14T00:00:00.000Z",
    });
    const xml = await documentXml(buf);
    const ids = [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(4); // 2 ins + 2 del
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("handles an empty diff without throwing", async () => {
    const buf = await renderContractRedlineDocx({
      title: "Empty",
      fromVersion: 1,
      toVersion: 2,
      counts: { added: 0, removed: 0, changed: 0, unchanged: 5 },
      clauses: [],
      generatedAt: "2026-10-14T00:00:00.000Z",
    });
    const xml = await documentXml(buf);
    expect(xml).toContain("No clause differences");
  });

  it("builds a safe, versioned filename", () => {
    expect(contractRedlineDocxFilename("MSA — Acme Robotics!", 2, 3)).toBe("msa-acme-robotics-redline-v2-v3.docx");
    expect(contractRedlineDocxFilename("", 1, 2)).toBe("contract-redline-v1-v2.docx");
  });
});
