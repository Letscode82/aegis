/**
 * Agent deliverable rendering — turns an agent's structured
 * recommendation into a professional Word (.docx) document the
 * reviewer can download and (after human approval) share with the
 * client / counterparty.
 *
 * One renderer serves every agent: the NDA reply, the contract issues
 * memo, the trademark clearance report, the notice situation brief,
 * the privacy assessment, etc. all flow through the same structured
 * shape (drafted output + reasoning + concerns + risks + playbook +
 * precedents). Server-only (Node Buffer).
 *
 * Governance: the document is stamped DRAFT — attorney review required.
 * It is a draft artifact, not an executed instrument; the human
 * approval + send steps remain the gate.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from "docx";

export interface DeliverableInput {
  ticket: {
    id: string;
    type?: string | null;
    from?: string | null;
    dept?: string | null;
    submitted?: string | null;
  };
  agent: { id: string; name?: string | null };
  recommendation: {
    confidence?: number | null;
    suggestedAction?: string | null;
    draftedResponse?: string | null;
    reasoning?: string | null;
    concerns?: string[];
    citations?: Array<{ id?: string; title?: string }>;
    risks?: string[];
    playbook?: { id?: string; version?: string } | null;
  };
  /** ISO string — pass in (Date.now is unavailable in some contexts). */
  generatedAt: string;
  /** Reviewer / actor name for the footer, if known. */
  generatedBy?: string | null;
}

const NAVY = "1B2A4A";
const GREY = "5B6472";
const AMBER = "9A6A00";
const RULE = "C9D1DC";

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 24 })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text, size: 21 })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, size: 21 })] });
}

// Split a drafted response (\n\n paragraphs, \n line breaks) into docx
// paragraphs so the Word output preserves the agent's formatting.
function multiline(text: string): Paragraph[] {
  const blocks = String(text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [body("(no drafted content)")];
  return blocks.map(
    (block) =>
      new Paragraph({
        spacing: { after: 120 },
        children: block.split(/\n/).flatMap((line, i) =>
          i === 0 ? [new TextRun({ text: line, size: 21 })] : [new TextRun({ text: line, size: 21, break: 1 })],
        ),
      }),
  );
}

export async function renderAgentDeliverableDocx(input: DeliverableInput): Promise<Buffer> {
  const { ticket, agent, recommendation: rec } = input;
  const agentName = agent.name || agent.id;
  const confPct = typeof rec.confidence === "number" ? `${Math.round(rec.confidence * 100)}%` : "—";
  const children: Paragraph[] = [];

  // Masthead
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "AEGIS LEGAL", bold: true, color: NAVY, size: 20, characterSpacing: 40 })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `${agentName} — Deliverable`, bold: true, color: NAVY, size: 34 })],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 8 } },
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: `${ticket.id}${ticket.type ? ` · ${ticket.type}` : ""} · Prepared ${input.generatedAt.slice(0, 10)}`,
          color: GREY,
          size: 18,
        }),
      ],
    }),
  );

  // DRAFT banner
  children.push(
    new Paragraph({
      shading: { type: ShadingType.SOLID, color: "FFF4D6", fill: "FFF4D6" },
      spacing: { after: 160 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 6 } },
      children: [
        new TextRun({
          text: "DRAFT — AI-generated. Attorney review and approval required before this is sent to any client or counterparty. Not an executed instrument.",
          italics: true,
          color: AMBER,
          size: 18,
        }),
      ],
    }),
  );

  // Recommendation summary
  children.push(heading("Recommendation"));
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "Suggested action: ", bold: true, size: 21 }),
        new TextRun({ text: `${rec.suggestedAction || "—"}    `, size: 21 }),
        new TextRun({ text: "Confidence: ", bold: true, size: 21 }),
        new TextRun({ text: confPct, size: 21 }),
      ],
    }),
  );
  if (rec.reasoning) children.push(body(rec.reasoning));

  // Requester context
  children.push(heading("Request"));
  children.push(
    body(
      `Requester: ${ticket.from || "—"}${ticket.dept ? ` (${ticket.dept})` : ""}${
        ticket.submitted ? ` · Submitted ${ticket.submitted}` : ""
      }`,
    ),
  );

  // The drafted output — the substance (NDA reply / issues memo /
  // clearance report / situation brief / assessment …).
  children.push(heading("Prepared output"));
  children.push(...multiline(rec.draftedResponse || ""));

  // Concerns / issues
  if (rec.concerns && rec.concerns.length) {
    children.push(heading("Issues to confirm"));
    rec.concerns.forEach((c) => children.push(bullet(c)));
  }

  // Risks checklist
  if (rec.risks && rec.risks.length) {
    children.push(heading("Risks to weigh before approving"));
    rec.risks.forEach((r) => children.push(bullet(r)));
  }

  // Playbook applied
  if (rec.playbook?.id) {
    children.push(heading("Standard applied"));
    children.push(body(`Playbook: ${rec.playbook.id}${rec.playbook.version ? ` (${rec.playbook.version})` : ""}`));
  }

  // Precedents / sources
  if (rec.citations && rec.citations.length) {
    children.push(heading("Sources & precedents"));
    rec.citations.forEach((c) => children.push(bullet(`${c.title || c.id || ""}${c.id && c.title ? ` [${c.id}]` : ""}`)));
  }

  // Footer
  children.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 8 } },
      spacing: { before: 240 },
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: `Generated by AEGIS ${agentName}${input.generatedBy ? `, reviewed by ${input.generatedBy}` : ""}. Every action on this matter is recorded in the tamper-evident audit ledger.`,
          color: GREY,
          size: 16,
          italics: true,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "AEGIS Legal",
    title: `${agentName} deliverable — ${ticket.id}`,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

/** A safe filename for the download. */
export function deliverableFilename(ticketId: string, agentId: string): string {
  const clean = (s: string) => String(s || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `AEGIS-${clean(ticketId)}-${clean(agentId)}-deliverable.docx`;
}
