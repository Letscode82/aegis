/**
 * Intake document upload server ingest (P4a follow-up). Persists a row
 * on the shared Document entity (ownerType INTAKE) with extracted text,
 * and writes a chain-sealed intake.document.uploaded audit row.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const documentCreate = vi.fn();
const logAuditMock = vi.fn();
const getOrgMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: { document: { create: documentCreate } },
  logAudit: logAuditMock,
  getCurrentOrganization: getOrgMock,
  getCurrentUser: getUserMock,
  DocumentOwnerType: { INTAKE: "INTAKE", MATTER: "MATTER" },
}));

const {
  ingestIntakeDocument,
  UnsupportedDocumentFormatError,
  DocumentParseError,
  DocumentTooLargeError,
  MAX_DOCUMENT_BYTES,
} = await import("../src/documents/server");

beforeEach(() => {
  documentCreate.mockReset().mockResolvedValue({ id: "doc-1" });
  logAuditMock.mockReset().mockResolvedValue("audit-1");
  getOrgMock.mockReset().mockResolvedValue({ id: "org1" });
  getUserMock.mockReset().mockResolvedValue({ id: "u-1", name: "Alex" });
});

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("ingestIntakeDocument()", () => {
  it("extracts a .txt, persists a Document, and audits", async () => {
    const res = await ingestIntakeDocument({
      filename: "nda.txt",
      mimeType: "text/plain",
      contentBase64: b64("Mutual NDA with Acme Robotics, 2-year term."),
      ticketId: "REQ-3901",
    });

    expect(res.format).toBe("txt");
    expect(res.documentId).toBe("doc-1");
    expect(res.text).toContain("Mutual NDA with Acme Robotics");
    expect(res.charCount).toBeGreaterThan(0);

    const data = documentCreate.mock.calls[0][0].data;
    expect(data.ownerType).toBe("INTAKE");
    expect(data.ownerId).toBe("REQ-3901");
    expect(data.extractedText).toContain("Mutual NDA");
    expect(data.uploadedBy).toBe("u-1");
    expect(data.sizeBytes).toBeGreaterThan(0);
    expect(data.storageUrl).toMatch(/^inline:\/\/intake\/REQ-3901\//);

    const audit = logAuditMock.mock.calls[0][0];
    expect(audit.action).toBe("intake.document.uploaded");
    expect(audit.resourceType).toBe("Document");
    expect(audit.afterJson.ticketId).toBe("REQ-3901");
  });

  it("requires a ticketId", async () => {
    await expect(
      ingestIntakeDocument({ filename: "a.txt", contentBase64: b64("hi"), ticketId: "" }),
    ).rejects.toBeInstanceOf(DocumentParseError);
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    await expect(
      ingestIntakeDocument({ filename: "a.txt", contentBase64: "", ticketId: "REQ-1" }),
    ).rejects.toBeInstanceOf(DocumentParseError);
  });

  it("rejects unsupported formats (legacy .doc) before persisting", async () => {
    await expect(
      ingestIntakeDocument({
        filename: "contract.doc",
        contentBase64: b64("\xd0\xcf binary doc"),
        ticketId: "REQ-1",
      }),
    ).rejects.toBeInstanceOf(UnsupportedDocumentFormatError);
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("rejects an oversized file", async () => {
    const big = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41).toString("base64");
    await expect(
      ingestIntakeDocument({ filename: "big.txt", contentBase64: big, ticketId: "REQ-1" }),
    ).rejects.toBeInstanceOf(DocumentTooLargeError);
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("keeps the size ceiling under the 4.5 MB serverless request cap once base64-encoded", () => {
    // The file rides as base64 (~4/3 the raw bytes) inside a JSON body.
    // The decoded max must stay small enough that the encoded request
    // fits under the 4.5 MB serverless body cap — else uploads at the
    // advertised limit fail with an opaque platform 413.
    const base64Bytes = Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4;
    expect(base64Bytes).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("oversized error tells the user how to recover", async () => {
    const big = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41).toString("base64");
    await expect(
      ingestIntakeDocument({ filename: "big.txt", contentBase64: big, ticketId: "REQ-1" }),
    ).rejects.toThrow(/paste the text/i);
  });
});
