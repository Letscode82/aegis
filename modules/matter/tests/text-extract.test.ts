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
