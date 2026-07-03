/**
 * POST /api/intake/documents/finalize — turn a completed direct upload
 * into a Document row (W4-6). Fetches the blob bytes server-side
 * (SSRF-guarded to the blob-store host space), extracts text, persists
 * with the real blob URL (original bytes retained), chain-sealed audit.
 * Same response shape as the inline upload so the form is path-agnostic.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  finalizeBlobDocument,
  BlobUrlNotAllowedError,
} from "@aegis/intake/documents-blob";
import {
  UnsupportedDocumentFormatError,
  DocumentParseError,
  DocumentTooLargeError,
} from "@aegis/intake/documents";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeCreateTicket);
  if (!actor) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await finalizeBlobDocument(
      {
        url: typeof body.url === "string" ? body.url : "",
        filename: typeof body.filename === "string" ? body.filename : "",
        mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
        ticketId: typeof body.ticketId === "string" ? body.ticketId : "",
      },
      { req, res },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BlobUrlNotAllowedError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err instanceof DocumentTooLargeError) {
      return res.status(413).json({ ok: false, error: err.message });
    }
    if (
      err instanceof UnsupportedDocumentFormatError ||
      err instanceof DocumentParseError
    ) {
      return res.status(422).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/documents/finalize] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
