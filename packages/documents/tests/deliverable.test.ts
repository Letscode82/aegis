/**
 * Agent deliverable renderer — produces a valid, non-empty .docx that
 * carries the agent's substance and the DRAFT governance stamp.
 */
import { describe, expect, it } from "vitest";
import { renderAgentDeliverableDocx, deliverableFilename } from "../src/index";
import JSZip from "jszip";

const INPUT = {
  ticket: { id: "REQ-3740", type: "NDA Request", from: "Dana Lee", dept: "Sales", submitted: "2026-07-09 10:00" },
  agent: { id: "nda-agent", name: "NDA Agent" },
  recommendation: {
    confidence: 0.92,
    suggestedAction: "flag-for-review",
    draftedResponse: "Hi Dana,\n\nI reviewed the mutual NDA.\n\nOne flag: the governing law is India, not Delaware.",
    reasoning: "Standard NDA with a jurisdiction deviation requiring attorney review.",
    concerns: ["Governing law conflict: India vs the Delaware playbook.", "Counterparty entity name is unfilled."],
    citations: [{ id: "NDA-TEMPLATE-v4.2", title: "Standard Mutual NDA Template" }],
    risks: ["Entity-resolution: verify the exact legal name before relying on a prior-NDA result."],
    playbook: { id: "NDA-PLAYBOOK", version: "MNDA-v4.2" },
  },
  generatedAt: "2026-07-09T10:05:00.000Z",
  generatedBy: "Harsha G",
};

async function docText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ");
}

describe("renderAgentDeliverableDocx", () => {
  it("produces a valid .docx (zip with a PK signature) that opens", async () => {
    const buf = await renderAgentDeliverableDocx(INPUT);
    expect(buf.length).toBeGreaterThan(1000);
    // .docx is a zip → starts with the PK local-file-header magic bytes.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("word/document.xml")).toBeTruthy();
  });

  it("carries the agent's substance and the DRAFT governance stamp", async () => {
    const text = await docText(await renderAgentDeliverableDocx(INPUT));
    expect(text).toContain("NDA Agent");
    expect(text).toContain("REQ-3740");
    expect(text).toContain("DRAFT"); // governance stamp
    expect(text).toContain("Attorney review");
    expect(text).toContain("governing law is India"); // drafted output preserved
    expect(text).toContain("Governing law conflict"); // a concern
    expect(text).toContain("NDA-PLAYBOOK"); // playbook stamp
    expect(text).toContain("Risks to weigh"); // risk checklist heading
  });

  it("degrades gracefully on a sparse recommendation", async () => {
    const buf = await renderAgentDeliverableDocx({
      ticket: { id: "REQ-1" },
      agent: { id: "faq-agent" },
      recommendation: { suggestedAction: "approve-and-send", draftedResponse: "" },
      generatedAt: "2026-07-09T00:00:00.000Z",
    });
    expect(buf.length).toBeGreaterThan(500);
  });

  it("builds a safe download filename", () => {
    expect(deliverableFilename("REQ-3740", "nda-agent")).toBe("AEGIS-REQ-3740-nda-agent-deliverable.docx");
    expect(deliverableFilename("a/b c", "x:y")).toBe("AEGIS-a-b-c-x-y-deliverable.docx");
  });
});
