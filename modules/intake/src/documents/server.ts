/**
 * Intake document upload (P4a follow-up) — server ingest.
 *
 * Accepts a base64-encoded .txt / .docx, extracts the text (see
 * ./extract.ts), and persists a row on the shared `Document` entity
 * (ownerType INTAKE, ownerId = the intake ticket id) with the extracted
 * text stored inline. Writes a chain-sealed `intake.document.uploaded`
 * audit row. Returns the extracted text so the New Request form can fold
 * it into the ticket description, which is what the client-side agents
 * read — so an uploaded NDA / MSA actually drives the agent.
 *
 * No blob store is wired yet, so the file bytes themselves are not
 * retained — only the extracted text (the part the platform reasons
 * over). `storageUrl` records a synthetic `inline://` locator. Sunset
 * when @aegis/documents adds real storage.
 *
 * Server-only — imports @aegis/db.
 */
import {
  prisma,
  logAudit,
  getCurrentOrganization,
  getCurrentUser,
  DocumentOwnerType,
} from "@aegis/db";
import {
  extractDocumentText,
  UnsupportedDocumentFormatError,
  DocumentParseError,
  type DocumentFormat,
} from "./extract";

export { UnsupportedDocumentFormatError, DocumentParseError };

/** Max upload size (decoded). Demo guard — inline storage isn't for big
 * files. 5 MB comfortably covers any NDA / MSA as .docx or .txt. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export class DocumentTooLargeError extends Error {
  constructor(bytes: number) {
    super(`Document is ${(bytes / 1024 / 1024).toFixed(1)} MB — max ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`);
    this.name = "DocumentTooLargeError";
  }
}

export interface IngestDocumentInput {
  filename: string;
  mimeType?: string;
  /** Base64-encoded file bytes. */
  contentBase64: string;
  /** The intake ticket this document attaches to (its eventual id). */
  ticketId: string;
}

export interface IngestDocumentResult {
  documentId: string;
  name: string;
  format: DocumentFormat;
  sizeBytes: number;
  charCount: number;
  /** Extracted plain text — the caller folds this into the ticket. */
  text: string;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export async function ingestIntakeDocument(
  input: IngestDocumentInput,
  ctx: Ctx = {},
): Promise<IngestDocumentResult> {
  const filename = (input.filename ?? "").trim() || "document";
  const ticketId = (input.ticketId ?? "").trim();
  if (!ticketId) {
    throw new DocumentParseError("ticketId is required to attach a document.");
  }
  if (!input.contentBase64) {
    throw new DocumentParseError("No file content provided.");
  }

  const buf = Buffer.from(input.contentBase64, "base64");
  if (buf.length === 0) {
    throw new DocumentParseError("Uploaded file is empty.");
  }
  if (buf.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(buf.length);
  }

  // Throws UnsupportedDocumentFormatError / DocumentParseError on bad input.
  const { format, text } = extractDocumentText(filename, input.mimeType, buf);

  const org = await getCurrentOrganization(ctx.req, ctx.res);
  const user = await getCurrentUser(ctx.req, ctx.res);

  const mimeType =
    input.mimeType ||
    (format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/plain");

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      name: filename,
      mimeType,
      sizeBytes: buf.length,
      storageUrl: `inline://intake/${ticketId}/${encodeURIComponent(filename)}`,
      ownerType: DocumentOwnerType.INTAKE,
      ownerId: ticketId,
      uploadedBy: user.id,
      extractedText: text,
    },
    select: { id: true },
  });

  await logAudit({
    organizationId: org.id,
    actorId: user.id,
    actorType: "USER",
    action: "intake.document.uploaded",
    resourceType: "Document",
    resourceId: doc.id,
    afterJson: {
      name: filename,
      format,
      sizeBytes: buf.length,
      charCount: text.length,
      ticketId,
    },
    metadata: { source: "intake-upload" },
  });

  return {
    documentId: doc.id,
    name: filename,
    format,
    sizeBytes: buf.length,
    charCount: text.length,
    text,
  };
}

/** List documents attached to an intake ticket (id + name + size). */
export async function listIntakeDocumentsForTicket(
  organizationId: string,
  ticketId: string,
): Promise<Array<{ id: string; name: string; sizeBytes: number; uploadedAt: string }>> {
  const rows = await prisma.document.findMany({
    where: { organizationId, ownerType: DocumentOwnerType.INTAKE, ownerId: ticketId },
    select: { id: true, name: true, sizeBytes: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sizeBytes: r.sizeBytes,
    uploadedAt: r.uploadedAt.toISOString(),
  }));
}
