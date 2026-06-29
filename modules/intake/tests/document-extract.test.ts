/**
 * Document text extraction (intake upload, P4a follow-up). Pure — builds
 * a real single-entry .docx ZIP in-memory (deflate via zlib) so the ZIP
 * + WordprocessingML path is exercised end-to-end, offline.
 */
import { describe, expect, it } from "vitest";
import { deflateRawSync, deflateSync } from "node:zlib";
import {
  detectFormat,
  docxXmlToText,
  extractDocumentText,
  extractPdfText,
  UnsupportedDocumentFormatError,
  DocumentParseError,
} from "../src/documents/extract";

/** A minimal single-page PDF whose content stream shows `lines` via text
 * operators. `compress` wraps the content stream in FlateDecode (zlib) so
 * both the inflate path and the raw path are exercised. The xref is
 * deliberately minimal — the extractor scans streams, not the xref. */
function buildSimplePdf(lines: string[], compress = false): Buffer {
  const ops =
    "BT /F1 18 Tf 72 720 Td " +
    lines.map((l) => `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*`).join(" ") +
    " ET";
  const body = compress ? deflateSync(Buffer.from(ops, "latin1")) : Buffer.from(ops, "latin1");
  const filter = compress ? " /Filter /FlateDecode" : "";
  const head =
    "%PDF-1.4\n" +
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n" +
    `4 0 obj << /Length ${body.length}${filter} >>\nstream\n`;
  const tail = "\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
  return Buffer.concat([Buffer.from(head, "latin1"), body, Buffer.from(tail, "latin1")]);
}

/** Assemble a minimal valid .docx (ZIP with one deflated entry). */
function buildDocx(xml: string): Buffer {
  const name = Buffer.from("word/document.xml", "utf8");
  const data = Buffer.from(xml, "utf8");
  const comp = deflateRawSync(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(0, 14); // crc (reader ignores)
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const localPart = Buffer.concat([local, name, comp]);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(8, 10); // method deflate
  cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(0, 42); // local header offset
  const central = Buffer.concat([cen, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, central, eocd]);
}

describe("detectFormat", () => {
  it("recognises .txt, .docx and .pdf", () => {
    expect(detectFormat("a.txt")).toBe("txt");
    expect(detectFormat("a.docx")).toBe("docx");
    expect(detectFormat("a.pdf")).toBe("pdf");
    expect(detectFormat("x", "application/pdf")).toBe("pdf");
    expect(
      detectFormat("x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
  });
  it("rejects legacy .doc and unknown types", () => {
    expect(() => detectFormat("old.doc")).toThrow(UnsupportedDocumentFormatError);
    expect(() => detectFormat("thing.xyz")).toThrow(UnsupportedDocumentFormatError);
  });
});

describe("docxXmlToText", () => {
  it("turns paragraphs into newlines and decodes entities", () => {
    const xml =
      "<w:document><w:body>" +
      "<w:p><w:r><w:t>Mutual NDA with Acme &amp; Co.</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>2-year term</w:t><w:tab/><w:t>Delaware law</w:t></w:r></w:p>" +
      "</w:body></w:document>";
    const text = docxXmlToText(xml);
    expect(text).toContain("Mutual NDA with Acme & Co.");
    expect(text).toContain("2-year term\tDelaware law");
    // Two paragraphs → a newline between them.
    expect(text.split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("extractDocumentText", () => {
  it("returns verbatim text for .txt", () => {
    const buf = Buffer.from("Please review the attached NDA.\nNet-45 terms.", "utf8");
    const out = extractDocumentText("note.txt", "text/plain", buf);
    expect(out.format).toBe("txt");
    expect(out.text).toBe("Please review the attached NDA.\nNet-45 terms.");
  });

  it("extracts body text from a real .docx ZIP", () => {
    const docx = buildDocx(
      "<w:document><w:body><w:p><w:r><w:t>NON-DISCLOSURE AGREEMENT between Globex and Initech.</w:t></w:r></w:p></w:body></w:document>",
    );
    const out = extractDocumentText("nda.docx", undefined, docx);
    expect(out.format).toBe("docx");
    expect(out.text).toContain("NON-DISCLOSURE AGREEMENT between Globex and Initech.");
  });

  it("throws on a .docx with no document.xml", () => {
    // A valid-looking ZIP but empty central directory → entry not found.
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    const buf = eocd;
    expect(() => extractDocumentText("broken.docx", undefined, buf)).toThrow(
      DocumentParseError,
    );
  });

  it("rejects an unsupported extension (.doc) before reading bytes", () => {
    expect(() =>
      extractDocumentText("contract.doc", undefined, Buffer.from("x")),
    ).toThrow(UnsupportedDocumentFormatError);
  });

  it("extracts text from an uncompressed PDF content stream", () => {
    const pdf = buildSimplePdf([
      "MUTUAL NON-DISCLOSURE AGREEMENT",
      "between Acme Robotics and Globex Corporation.",
      "Term: 2 years. Governing law: Delaware.",
    ]);
    const out = extractDocumentText("nda.pdf", "application/pdf", pdf);
    expect(out.format).toBe("pdf");
    expect(out.text).toMatch(/NON-DISCLOSURE AGREEMENT/i);
    expect(out.text).toMatch(/Acme Robotics/);
    expect(out.text).toMatch(/Delaware/);
  });

  it("extracts text from a FlateDecode-compressed PDF content stream", () => {
    const pdf = buildSimplePdf(
      ["CONFIDENTIALITY AGREEMENT for Initech and Soylent, governed by New York law."],
      true,
    );
    const out = extractPdfText(pdf);
    expect(out).toMatch(/CONFIDENTIALITY AGREEMENT/i);
    expect(out).toMatch(/New York law/);
  });

  it("fails honestly on a PDF with no extractable text", () => {
    // Valid header, but no content streams with text operators.
    const buf = Buffer.from("%PDF-1.4\n%%EOF", "latin1");
    expect(() => extractPdfText(buf)).toThrow(DocumentParseError);
    expect(() => extractPdfText(buf)).toThrow(/scanned or image-only/i);
  });

  it("rejects a non-PDF buffer routed to the PDF parser", () => {
    expect(() => extractPdfText(Buffer.from("not a pdf", "latin1"))).toThrow(
      /missing %PDF header/i,
    );
  });
});
