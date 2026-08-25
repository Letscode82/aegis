import { describe, it, expect } from "vitest";
import { NativeJsEngine, nativeProcessingEngine, getProcessingEngineForOrg, summarizeExceptions } from "../src/internal/services/processing";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("NativeJsEngine", () => {
  const eng = new NativeJsEngine();

  it("has a stable name", () => {
    expect(eng.name).toBe("native-js");
  });

  it("bodyToText strips html and passes plain text through", () => {
    expect(eng.bodyToText("<p>Hello <b>world</b></p>", "html")).toBe("Hello world");
    expect(eng.bodyToText("just text", "text")).toBe("just text");
    expect(eng.bodyToText(null)).toBeNull();
  });

  it("extract returns text for supported types", async () => {
    const r = await eng.extract({ contentType: "text/plain", contentBytesB64: b64("pricing model") });
    expect(r.text).toBe("pricing model");
    expect(r.exception).toBeNull();
  });

  it("extract returns an EMPTY exception for missing bytes", async () => {
    const r = await eng.extract({ contentType: "text/plain", contentBytesB64: null });
    expect(r.text).toBeNull();
    expect(r.exception?.code).toBe("EMPTY");
  });

  it("extract flags images as UNSUPPORTED (OCR needed)", async () => {
    const r = await eng.extract({ contentType: "image/png", filename: "scan.png", contentBytesB64: b64("\x89PNG....") });
    expect(r.text).toBeNull();
    expect(r.exception?.code).toBe("UNSUPPORTED");
    expect(r.exception?.reason).toMatch(/ocr/i);
  });
});

describe("getProcessingEngineForOrg", () => {
  it("returns the native engine by default", async () => {
    const eng = await getProcessingEngineForOrg("org-1");
    expect(eng.name).toBe("native-js");
    expect(eng).toBe(nativeProcessingEngine());
  });
});

describe("exception classification + summary (PROC-8)", () => {
  const eng = new NativeJsEngine();
  it("flags an encrypted OOXML package as ENCRYPTED", async () => {
    const b = Buffer.from("PK EncryptedPackage payload", "latin1").toString("base64");
    const r = await eng.extract({ contentType: "application/octet-stream", filename: "secret.docx", contentBytesB64: b });
    expect(r.exception?.code).toBe("ENCRYPTED");
  });
  it("summarizeExceptions tallies by code", () => {
    const out = summarizeExceptions([
      { code: "UNSUPPORTED", reason: "" },
      { code: "UNSUPPORTED", reason: "" },
      { code: "ENCRYPTED", reason: "" },
      null,
    ]);
    expect(out).toEqual({ UNSUPPORTED: 2, ENCRYPTED: 1 });
  });
});
