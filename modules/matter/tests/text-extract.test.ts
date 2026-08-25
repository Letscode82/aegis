import { describe, it, expect } from "vitest";
import { htmlToText, extractAttachmentText } from "../src/internal/services/text-extract";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("htmlToText", () => {
  it("strips tags, scripts, styles, and entities", () => {
    const out = htmlToText("<style>x{}</style><p>Hello&nbsp;<b>world</b> &amp; more</p><script>bad()</script>");
    expect(out).toBe("Hello world & more");
  });
  it("returns null for empty input", () => {
    expect(htmlToText("")).toBeNull();
    expect(htmlToText(null)).toBeNull();
  });
});

describe("extractAttachmentText", () => {
  it("decodes text/* directly", async () => {
    expect(await extractAttachmentText("text/plain", b64("the pricing model"))).toBe("the pricing model");
  });
  it("strips html attachments", async () => {
    expect(await extractAttachmentText("text/html", b64("<h1>Deal</h1> terms"))).toBe("Deal terms");
  });
  it("handles csv/json/xml", async () => {
    expect(await extractAttachmentText("application/json", b64('{"a":1}'))).toBe('{"a":1}');
  });
  it("returns null for empty / missing bytes", async () => {
    expect(await extractAttachmentText("text/plain", null)).toBeNull();
    expect(await extractAttachmentText("text/plain", "")).toBeNull();
  });
  it("returns null for an unsupported binary type (keeps the filename)", async () => {
    // A tiny PNG header, contentType image/png — no text extractor, no OCR yet.
    expect(await extractAttachmentText("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"))).toBeNull();
  });
});

import * as XLSX from "xlsx";
import JSZip from "jszip";

describe("office extraction (round-trip)", () => {
  it("extracts text from a real XLSX buffer", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["Custodian", "Amount"], ["Priya", "Net 45 pricing"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deal");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const out = await extractAttachmentText(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buf.toString("base64"),
    );
    expect(out).toMatch(/Priya/);
    expect(out).toMatch(/Net 45 pricing/);
  });

  it("extracts text from a real PPTX buffer", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("ppt/slides/slide1.xml", '<p:sld xmlns:a="x"><a:t>Section 8.2 IP ownership</a:t><a:t>pricing model</a:t></p:sld>');
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const out = await extractAttachmentText(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buf.toString("base64"),
    );
    expect(out).toMatch(/Section 8\.2 IP ownership/);
    expect(out).toMatch(/pricing model/);
  });
});
