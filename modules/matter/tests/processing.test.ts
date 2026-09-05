import { describe, it, expect } from "vitest";
import { NativeJsEngine, nativeProcessingEngine, getProcessingEngineForOrg, getProcessingStatusForOrg, resolveConfiguredMode, summarizeExceptions } from "../src/internal/services/processing";
import { getPurviewProcessingStatus } from "../src/internal/services/purview-engine";

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
    const prev = process.env.TIKA_SERVER_URL;
    delete process.env.TIKA_SERVER_URL;
    const eng = await getProcessingEngineForOrg("org-1");
    expect(eng.name).toBe("native-js");
    expect(eng).toBe(nativeProcessingEngine());
    if (prev !== undefined) process.env.TIKA_SERVER_URL = prev;
  });
});

describe("getProcessingStatusForOrg", () => {
  it("reports native mode when no Tika sidecar is configured", async () => {
    const prevUrl = process.env.TIKA_SERVER_URL;
    const prevMode = process.env.AEGIS_PROCESSING_MODE;
    delete process.env.TIKA_SERVER_URL;
    delete process.env.AEGIS_PROCESSING_MODE;
    const s = await getProcessingStatusForOrg("org-1");
    expect(s.configuredMode).toBe("auto");
    expect(s.mode).toBe("native");
    expect(s.engine).toBe("native-js");
    expect(s.tika).toBeUndefined();
    expect(s.purview).toBeUndefined();
    if (prevUrl !== undefined) process.env.TIKA_SERVER_URL = prevUrl;
    if (prevMode !== undefined) process.env.AEGIS_PROCESSING_MODE = prevMode;
  });
});

describe("processing mode selection (PROC-7)", () => {
  const save = () => ({ url: process.env.TIKA_SERVER_URL, mode: process.env.AEGIS_PROCESSING_MODE });
  const restore = (s: { url?: string; mode?: string }) => {
    if (s.url === undefined) delete process.env.TIKA_SERVER_URL; else process.env.TIKA_SERVER_URL = s.url;
    if (s.mode === undefined) delete process.env.AEGIS_PROCESSING_MODE; else process.env.AEGIS_PROCESSING_MODE = s.mode;
  };

  it("resolveConfiguredMode reads AEGIS_PROCESSING_MODE, defaulting to auto", () => {
    const s = save();
    delete process.env.AEGIS_PROCESSING_MODE; expect(resolveConfiguredMode()).toBe("auto");
    process.env.AEGIS_PROCESSING_MODE = "native"; expect(resolveConfiguredMode()).toBe("native");
    process.env.AEGIS_PROCESSING_MODE = "TIKA"; expect(resolveConfiguredMode()).toBe("tika");
    process.env.AEGIS_PROCESSING_MODE = "purview"; expect(resolveConfiguredMode()).toBe("purview");
    process.env.AEGIS_PROCESSING_MODE = "nonsense"; expect(resolveConfiguredMode()).toBe("auto");
    restore(s);
  });

  it("native mode wins even when a Tika sidecar is configured", async () => {
    const s = save();
    process.env.AEGIS_PROCESSING_MODE = "native";
    process.env.TIKA_SERVER_URL = "http://tika.invalid:9998";
    const eng = await getProcessingEngineForOrg("org-1");
    expect(eng.name).toBe("native-js");
    restore(s);
  });

  it("tika mode selects the Tika engine when a sidecar is configured (no network on construct)", async () => {
    const s = save();
    process.env.AEGIS_PROCESSING_MODE = "tika";
    process.env.TIKA_SERVER_URL = "http://tika.invalid:9998";
    const eng = await getProcessingEngineForOrg("org-1");
    expect(eng.name).toBe("tika");
    restore(s);
  });

  it("purview mode falls back to base engine when eDiscovery is not connected", async () => {
    const s = save();
    process.env.AEGIS_PROCESSING_MODE = "purview";
    delete process.env.TIKA_SERVER_URL;
    // No orgId → gate short-circuits to not-connected without a DB hit.
    const eng = await getProcessingEngineForOrg(undefined);
    expect(eng.name).toBe("native-js");
    restore(s);
  });
});

describe("getPurviewProcessingStatus (PROC-7 gate)", () => {
  it("reports not-connected with a reason when no organization is given", async () => {
    const st = await getPurviewProcessingStatus(undefined);
    expect(st.connected).toBe(false);
    expect(st.reason).toBeTruthy();
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
