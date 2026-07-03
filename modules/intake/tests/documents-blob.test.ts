/**
 * W4-6 (upload at scale, issue #123) — blob finalize path.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const documentCreateMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: { document: { create: documentCreateMock } },
  logAudit: logAuditMock,
  getCurrentOrganization: vi.fn().mockResolvedValue({ id: "org1" }),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u-dana", name: "Dana" }),
  DocumentOwnerType: { INTAKE: "INTAKE" },
}));

const {
  isAllowedBlobUrl,
  clipExtractedText,
  getUploadMode,
  finalizeBlobDocument,
  BlobUrlNotAllowedError,
  MAX_EXTRACT_CHARS,
} = await import("../src/documents/blob");

const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/nda-x9.txt";

function fetcherFor(bytes: Buffer, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
}

beforeEach(() => {
  documentCreateMock.mockReset().mockResolvedValue({ id: "doc-1" });
  logAuditMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("isAllowedBlobUrl — SSRF guard", () => {
  it("allows only https URLs on the blob-store host space", () => {
    expect(isAllowedBlobUrl(BLOB_URL)).toBe(true);
    expect(isAllowedBlobUrl("http://abc.public.blob.vercel-storage.com/x")).toBe(false);
    expect(isAllowedBlobUrl("https://evil.example.com/x")).toBe(false);
    expect(isAllowedBlobUrl("https://evil.example.com/.blob.vercel-storage.com")).toBe(false);
    expect(isAllowedBlobUrl("https://xblob.vercel-storage.com/x")).toBe(false);
    expect(isAllowedBlobUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedBlobUrl("not a url")).toBe(false);
  });
});

describe("getUploadMode", () => {
  it("is inline (3 MB) without a token, direct (25 MB) with one", () => {
    expect(getUploadMode()).toEqual({ mode: "inline", maxBytes: 3 * 1024 * 1024 });
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_x";
    expect(getUploadMode()).toEqual({ mode: "direct", maxBytes: 25 * 1024 * 1024 });
  });
});

describe("clipExtractedText", () => {
  it("passes short text through and clips long text with a note", () => {
    expect(clipExtractedText("hello")).toBe("hello");
    const clipped = clipExtractedText("x".repeat(MAX_EXTRACT_CHARS + 10));
    expect(clipped.length).toBeLessThan(MAX_EXTRACT_CHARS + 100);
    expect(clipped).toContain("[Text truncated");
  });
});

describe("finalizeBlobDocument", () => {
  it("fetches the blob, extracts, persists with the real URL, audits", async () => {
    const fetcher = fetcherFor(Buffer.from("Mutual NDA between Acme and Zephyr.", "utf8"));
    const result = await finalizeBlobDocument(
      { url: BLOB_URL, filename: "nda.txt", mimeType: "text/plain", ticketId: "REQ-1" },
      {},
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith(BLOB_URL);
    expect(result).toMatchObject({ documentId: "doc-1", format: "txt" });
    expect(result.text).toContain("Mutual NDA");
    expect(documentCreateMock.mock.calls[0][0].data).toMatchObject({
      storageUrl: BLOB_URL, // original bytes retained at the real URL
      ownerType: "INTAKE",
      ownerId: "REQ-1",
    });
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      action: "intake.document.uploaded",
      afterJson: expect.objectContaining({ storage: "blob", ticketId: "REQ-1" }),
    });
  });

  it("refuses non-blob URLs before any network call", async () => {
    const fetcher = vi.fn();
    await expect(
      finalizeBlobDocument(
        { url: "https://internal.corp/secret", filename: "x.txt", ticketId: "REQ-1" },
        {},
        fetcher,
      ),
    ).rejects.toBeInstanceOf(BlobUrlNotAllowedError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces a storage read failure as a parse error", async () => {
    await expect(
      finalizeBlobDocument(
        { url: BLOB_URL, filename: "x.txt", ticketId: "REQ-1" },
        {},
        fetcherFor(Buffer.from(""), 404),
      ),
    ).rejects.toThrow(/HTTP 404/);
  });
});
