/**
 * POST /api/intake/documents/upload
 *
 * Upload a Word (.docx) or text (.txt) document and attach it to an
 * intake ticket. The server extracts the text, persists a Document row
 * on the shared entity (ownerType INTAKE), writes an
 * `intake.document.uploaded` audit row, and returns the extracted text
 * so the New Request form can fold it into the ticket description — the
 * text the client-side agents actually read.
 *
 * Body (JSON): { filename, mimeType?, contentBase64, ticketId }
 * Gated on intake:create_ticket — a requester filing a ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  ingestIntakeDocument,
  UnsupportedDocumentFormatError,
  DocumentParseError,
  DocumentTooLargeError,
} from "@aegis/intake/documents";
import { requireActor } from "../../../../lib/matter-actor";

// The file arrives as base64 in a JSON body (~33% larger than the raw
// bytes). We allow ~3 MB decoded → ~4 MB base64; a 5 MB parser limit
// leaves headroom for the JSON envelope while staying under the 4.5 MB
// request-body cap that serverless platforms (Vercel) enforce anyway.
export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

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
    const result = await ingestIntakeDocument(
      {
        filename: typeof body.filename === "string" ? body.filename : "",
        mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
        contentBase64:
          typeof body.contentBase64 === "string" ? body.contentBase64 : "",
        ticketId: typeof body.ticketId === "string" ? body.ticketId : "",
      },
      { req, res },
    );
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    if (
      err instanceof UnsupportedDocumentFormatError ||
      err instanceof DocumentParseError ||
      err instanceof DocumentTooLargeError
    ) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/documents/upload] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
