/**
 * Document text extraction (intake upload, P4a follow-up). Pure — builds
 * a real single-entry .docx ZIP in-memory (deflate via zlib) so the ZIP
 * + WordprocessingML path is exercised end-to-end, offline.
 */
import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  detectFormat,
  docxXmlToText,
  extractDocumentText,
  UnsupportedDocumentFormatError,
  DocumentParseError,
} from "../src/documents/extract";

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
  it("recognises .txt and .docx", () => {
    expect(detectFormat("a.txt")).toBe("txt");
    expect(detectFormat("a.docx")).toBe("docx");
    expect(
      detectFormat("x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx");
  });
  it("rejects PDF with a helpful message", () => {
    expect(() => detectFormat("nda.pdf")).toThrow(UnsupportedDocumentFormatError);
    expect(() => detectFormat("nda.pdf")).toThrow(/PDF is not supported/i);
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

  it("rejects an unsupported extension before reading bytes", () => {
    expect(() =>
      extractDocumentText("contract.pdf", "application/pdf", Buffer.from("x")),
    ).toThrow(UnsupportedDocumentFormatError);
  });
});
