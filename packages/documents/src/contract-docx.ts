/**
 * Contract Word (.docx) rendering — turns a persisted contract (title, parties,
 * key terms, draft body / clauses) into a professional Word document that the
 * business or counterparty can download, redline offline, or file.
 *
 * Server-only (Node Buffer). A DRAFT/negotiation contract is stamped DRAFT — an
 * EXECUTED contract renders as the executed instrument (no draft stamp). One
 * renderer; the contracts module gathers the data and calls it.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const NAVY = "1B2A4A";
const GREY = "5B6472";
const AMBER = "9A6A00";

export interface ContractDocInput {
  contract: {
    id: string;
    title: string;
    type: string;
    status: string;
    counterpartyName?: string | null;
    orgName?: string | null;
    value?: number | null;
    currency?: string | null;
    effectiveDate?: string | null;
    expiryDate?: string | null;
    governingLaw?: string | null;
    paymentTerms?: string | null;
    scopeOfServices?: string | null;
    draftText?: string | null;
  };
  clauses: Array<{ type: string; text: string; risk?: string | null; deviation?: boolean }>;
  /** ISO string — passed in so the renderer stays deterministic. */
  generatedAt: string;
  generatedBy?: string | null;
}

const heading = (text: string): Paragraph =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text, bold: true, color: NAVY, size: 24 })] });

const body = (text: string): Paragraph =>
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, size: 21 })] });

const kv = (label: string, value: string): Paragraph =>
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${label}:  `, bold: true, size: 20, color: GREY }), new TextRun({ text: value, size: 21 })] });

// Split prose (\n\n paragraphs, \n line breaks) into docx paragraphs.
function multiline(text: string): Paragraph[] {
  const blocks = String(text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [];
  return blocks.map((block) =>
    new Paragraph({
      spacing: { after: 120 },
      children: block.split(/\n/).flatMap((line, i) => (i === 0 ? [new TextRun({ text: line, size: 21 })] : [new TextRun({ text: line, size: 21, break: 1 })])),
    }),
  );
}

const money = (v: number | null | undefined, ccy?: string | null): string =>
  v == null ? "—" : `${ccy || "USD"} ${Number(v).toLocaleString()}`;
const dateOnly = (iso?: string | null): string => (iso ? iso.slice(0, 10) : "—");

export async function renderContractDocx(input: ContractDocInput): Promise<Buffer> {
  const { contract: c, clauses } = input;
  const executed = ["EXECUTED", "ACTIVE", "EXPIRED", "TERMINATED"].includes(c.status);
  const children: Paragraph[] = [];

  // Masthead
  children.push(
    new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: "AEGIS LEGAL", bold: true, color: NAVY, size: 20, characterSpacing: 40 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `${c.type.toUpperCase()} · ${c.status}`, color: GREY, size: 18, characterSpacing: 20 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: c.title, bold: true, color: NAVY, size: 34 })] }),
  );

  if (!executed) {
    children.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: "DRAFT — subject to negotiation and internal approval. Not an executed instrument.", bold: true, color: AMBER, size: 18 })] }));
  }

  // Parties & key terms
  children.push(heading("Parties & Key Terms"));
  children.push(kv("Provider", c.orgName || "AEGIS (internal party)"));
  children.push(kv("Counterparty", c.counterpartyName || "—"));
  children.push(kv("Contract value", money(c.value, c.currency)));
  children.push(kv("Effective date", dateOnly(c.effectiveDate)));
  children.push(kv("Expiry date", dateOnly(c.expiryDate)));
  children.push(kv("Payment terms", c.paymentTerms || "—"));
  children.push(kv("Governing law", c.governingLaw || "—"));

  // Body — the draft prose if present, else the extracted clause set.
  if (c.draftText && c.draftText.trim()) {
    children.push(heading("Agreement"));
    children.push(...multiline(c.draftText));
  } else {
    if (c.scopeOfServices && c.scopeOfServices.trim()) {
      children.push(heading("Scope of Services"));
      children.push(...multiline(c.scopeOfServices));
    }
    children.push(heading("Clauses"));
    if (clauses.length === 0) children.push(body("(No clauses recorded.)"));
    for (const cl of clauses) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({ text: cl.type.replace(/_/g, " "), bold: true, size: 21, color: NAVY }),
            ...(cl.deviation ? [new TextRun({ text: "  (deviation)", size: 18, color: AMBER })] : []),
          ],
        }),
        body(cl.text),
      );
    }
  }

  // Footer
  children.push(
    new Paragraph({ spacing: { before: 260, after: 0 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: `Generated by AEGIS on ${input.generatedAt.slice(0, 10)}${input.generatedBy ? `, by ${input.generatedBy}` : ""}. Every change to this contract is recorded in the tamper-evident audit ledger; executed terms are fingerprinted for integrity.`, italics: true, color: GREY, size: 16 })] }),
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** A safe download filename for a contract. */
export function contractDocxFilename(title: string, status: string): string {
  const clean = (s: string) => String(s || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `AEGIS-${clean(title)}-${clean(status)}.docx`;
}
