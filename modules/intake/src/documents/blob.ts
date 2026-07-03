/**
 * W4-6 · Upload at scale (issue #123) — blob-backed direct uploads.
 *
 * The inline path (documents/server.ts) rides base64 through a JSON
 * body and hits the serverless 4.5 MB request cap at ~3 MB decoded.
 * When a Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN set),
 * the browser uploads the ORIGINAL bytes directly to blob storage
 * (bypassing the function entirely), then calls the finalize endpoint;
 * the server fetches the blob (server→blob has no request-body cap),
 * extracts the text, and persists the Document row with the real blob
 * URL — original bytes retained, cap raised to 25 MB.
 *
 * Fallback-first: with no token configured, everything behaves exactly
 * as before (inline path, 3 MB). `getUploadMode()` tells the client
 * which path to use.
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
import { extractDocumentText, type DocumentFormat } from "./extract";
import { DocumentParseError, DocumentTooLargeError } from "./server";
import type { IngestDocumentResult } from "./server";

/** Direct-upload ceiling. Well under lambda memory for extraction. */
export const MAX_DIRECT_BYTES = 25 * 1024 * 1024;

/** Extracted text is clipped so a 25 MB PDF can't produce a
 *  multi-megabyte description/DB row. */
export const MAX_EXTRACT_CHARS = 400_000;

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export interface UploadMode {
  mode: "direct" | "inline";
  maxBytes: number;
}

/** What the New Request form asks before picking an upload path. */
export function getUploadMode(): UploadMode {
  return isBlobConfigured()
    ? { mode: "direct", maxBytes: MAX_DIRECT_BYTES }
    : { mode: "inline", maxBytes: 3 * 1024 * 1024 };
}

export class BlobUrlNotAllowedError extends Error {
  constructor(url: string) {
    super(`Refusing to fetch non-blob-store URL: ${url.slice(0, 120)}`);
    this.name = "BlobUrlNotAllowedError";
  }
}

/**
 * SSRF guard — the finalize endpoint only ever fetches from the Vercel
 * Blob public host space. Anything else (internal IPs, metadata
 * endpoints, arbitrary origins) is refused before any network call.
 */
export function isAllowedBlobUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname.endsWith(".blob.vercel-storage.com")
  );
}

export function clipExtractedText(text: string): string {
  if (text.length <= MAX_EXTRACT_CHARS) return text;
  return (
    text.slice(0, MAX_EXTRACT_CHARS) +
    "\n\n[Text truncated — full document retained in storage.]"
  );
}

export interface FinalizeBlobInput {
  /** The blob URL the client upload returned. */
  url: string;
  filename: string;
  mimeType?: string;
  ticketId: string;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

type Fetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

/**
 * Finalize a direct upload: fetch the blob's bytes server-side,
 * extract text, persist the Document row (storageUrl = the real blob
 * URL — original bytes retained), chain-sealed audit. Same result
 * shape as the inline ingest so the form code is path-agnostic.
 */
export async function finalizeBlobDocument(
  input: FinalizeBlobInput,
  ctx: Ctx = {},
  fetcher: Fetcher = fetch,
): Promise<IngestDocumentResult> {
  const filename = (input.filename ?? "").trim() || "document";
  const ticketId = (input.ticketId ?? "").trim();
  if (!ticketId) {
    throw new DocumentParseError("ticketId is required to attach a document.");
  }
  if (!isAllowedBlobUrl(input.url)) {
    throw new BlobUrlNotAllowedError(String(input.url ?? ""));
  }

  const resp = await fetcher(input.url);
  if (!resp.ok) {
    throw new DocumentParseError(
      `Could not read the uploaded file from storage (HTTP ${resp.status}).`,
    );
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length === 0) throw new DocumentParseError("Uploaded file is empty.");
  if (buf.length > MAX_DIRECT_BYTES) throw new DocumentTooLargeError(buf.length);

  const extracted = extractDocumentText(filename, input.mimeType, buf);
  const format: DocumentFormat = extracted.format;
  const text = clipExtractedText(extracted.text);

  const org = await getCurrentOrganization(ctx.req, ctx.res);
  const user = await getCurrentUser(ctx.req, ctx.res);

  const mimeType =
    input.mimeType ||
    (format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : format === "pdf"
        ? "application/pdf"
        : "text/plain");

  const doc = await prisma.document.create({
    data: {
      organizationId: org.id,
      name: filename,
      mimeType,
      sizeBytes: buf.length,
      storageUrl: input.url,
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
      storage: "blob",
    },
    metadata: { source: "intake-upload-direct" },
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
