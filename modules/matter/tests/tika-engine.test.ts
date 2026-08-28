import { describe, it, expect } from "vitest";
import { TikaEngine, tikaVersion } from "../src/internal/services/tika-engine";
import { NativeJsEngine } from "../src/internal/services/processing";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** A fetch stub that returns a canned Response and records the last request. */
function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const rmeta = (records: Array<Record<string, unknown>>, status = 200) =>
  new Response(JSON.stringify(records), { status });

describe("TikaEngine", () => {
  it("has a stable name", () => {
    expect(new TikaEngine("http://tika:9998").name).toBe("tika");
  });

  it("returns EMPTY for missing bytes without calling the server", async () => {
    const { impl, calls } = stubFetch(() => rmeta([]));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "text/plain", contentBytesB64: null });
    expect(r.exception?.code).toBe("EMPTY");
    expect(calls).toHaveLength(0);
  });

  it("extracts text from an rmeta record", async () => {
    const { impl, calls } = stubFetch(() => rmeta([{ "X-TIKA:content": "  quarterly pricing model  " }]));
    const eng = new TikaEngine("http://tika:9998/", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/pdf", contentBytesB64: b64("%PDF...") });
    expect(r.text).toBe("quarterly pricing model");
    expect(r.exception).toBeNull();
    expect(calls[0].url).toBe("http://tika:9998/rmeta/text"); // trailing slash normalised
    expect((calls[0].init as RequestInit).method).toBe("PUT");
  });

  it("concatenates text across container/embedded records", async () => {
    const { impl } = stubFetch(() =>
      rmeta([
        { "X-TIKA:content": "outer zip listing" },
        { "X-TIKA:content": "member one" },
        { "X-TIKA:content": "member two" },
      ]),
    );
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/zip", contentBytesB64: b64("PK...") });
    expect(r.text).toContain("member one");
    expect(r.text).toContain("member two");
    expect(r.exception).toBeNull();
  });

  it("classifies an encrypted document (exception metadata) as ENCRYPTED", async () => {
    const { impl } = stubFetch(() =>
      rmeta([{ "X-TIKA:EXCEPTION:embeddedException": "org...EncryptedDocumentException: document is encrypted" }]),
    );
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/pdf", contentBytesB64: b64("%PDF...") });
    expect(r.text).toBeNull();
    expect(r.exception?.code).toBe("ENCRYPTED");
  });

  it("classifies an empty parse with a non-encryption exception as CORRUPT", async () => {
    const { impl } = stubFetch(() => rmeta([{ "X-TIKA:EXCEPTION:runtime": "TikaException: unexpected end of file" }]));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/pdf", contentBytesB64: b64("garbage") });
    expect(r.exception?.code).toBe("CORRUPT");
  });

  it("returns EMPTY when a record parses cleanly but has no text", async () => {
    const { impl } = stubFetch(() => rmeta([{ "X-TIKA:Parsed-By": "org.apache.tika.parser.image.ImageParser" }]));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "image/png", contentBytesB64: b64("\x89PNG") });
    expect(r.exception?.code).toBe("EMPTY");
  });

  it("maps 422 with a password message to ENCRYPTED", async () => {
    const { impl } = stubFetch(() => new Response("EncryptedDocumentException: password required", { status: 422 }));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/pdf", contentBytesB64: b64("%PDF...") });
    expect(r.exception?.code).toBe("ENCRYPTED");
  });

  it("maps a generic 422 to CORRUPT", async () => {
    const { impl } = stubFetch(() => new Response("TikaException: could not parse", { status: 422 }));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/pdf", contentBytesB64: b64("bad") });
    expect(r.exception?.code).toBe("CORRUPT");
  });

  it("maps 415 to UNSUPPORTED", async () => {
    const { impl } = stubFetch(() => new Response("", { status: 415 }));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "application/x-weird", contentBytesB64: b64("x") });
    expect(r.exception?.code).toBe("UNSUPPORTED");
  });

  it("degrades to native on a transport failure", async () => {
    const impl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "text/plain", contentBytesB64: b64("native fallback text") });
    expect(r.text).toBe("native fallback text"); // came from NativeJsEngine
    expect(r.exception).toBeNull();
  });

  it("degrades to native on a 5xx", async () => {
    const { impl } = stubFetch(() => new Response("boom", { status: 503 }));
    const eng = new TikaEngine("http://tika:9998", { fetchImpl: impl });
    const r = await eng.extract({ contentType: "text/plain", contentBytesB64: b64("still readable") });
    expect(r.text).toBe("still readable");
    expect(r.exception).toBeNull();
  });

  it("bodyToText delegates to native HTML stripping", () => {
    const eng = new TikaEngine("http://tika:9998");
    expect(eng.bodyToText("<p>Hi <b>there</b></p>", "html")).toBe("Hi there");
  });
});

describe("tikaVersion", () => {
  it("returns the trimmed version string", async () => {
    const { impl, calls } = stubFetch(() => new Response("Apache Tika 2.9.2\n", { status: 200 }));
    const v = await tikaVersion("http://tika:9998/", impl);
    expect(v).toBe("Apache Tika 2.9.2");
    expect(calls[0].url).toBe("http://tika:9998/version");
  });

  it("throws on a non-200", async () => {
    const { impl } = stubFetch(() => new Response("", { status: 500 }));
    await expect(tikaVersion("http://tika:9998", impl)).rejects.toThrow(/500/);
  });
});

// Sanity: native still available as the ambient fallback the engine relies on.
describe("native fallback contract", () => {
  it("NativeJsEngine extracts plain text (the degrade target)", async () => {
    const r = await new NativeJsEngine().extract({ contentType: "text/plain", contentBytesB64: b64("ok") });
    expect(r.text).toBe("ok");
  });
});
