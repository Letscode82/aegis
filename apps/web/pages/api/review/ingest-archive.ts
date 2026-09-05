/**
 * POST /api/review/ingest-archive — PROC-6 archive ingest.
 *
 * Body: { fileName, contentType?, bytesB64, matterId?, name? }
 * Turns an uploaded ZIP (documents) or MBOX (mail export) into a review set via
 * the shared persistReviewSet seam. Gated matter:legal_hold:issue (same as
 * ad-hoc collection). Inline upload is capped (see MAX_ARCHIVE_BYTES) — large
 * archives need the Blob-upload/worker path.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { ingestArchive } from "@aegis/matter";
import { requireActor } from "../../../lib/matter-actor";

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const b = (req.body ?? {}) as Record<string, unknown>;
  const fileName = typeof b.fileName === "string" ? b.fileName : "";
  const bytesB64 = typeof b.bytesB64 === "string" ? b.bytesB64 : "";
  const blobUrl = typeof b.blobUrl === "string" ? b.blobUrl : "";
  if (!fileName || (!bytesB64 && !blobUrl)) {
    return res.status(400).json({ ok: false, error: { code: "MISSING_PARAMS", message: "fileName and one of bytesB64 / blobUrl are required" } });
  }

  try {
    const reviewSet = await ingestArchive(
      actor.organizationId,
      {
        fileName,
        contentType: typeof b.contentType === "string" ? b.contentType : null,
        bytesB64: bytesB64 || null,
        blobUrl: blobUrl || null,
        matterId: typeof b.matterId === "string" ? b.matterId : null,
        name: typeof b.name === "string" ? b.name : null,
      },
      { id: actor.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, reviewSet });
  } catch (err) {
    return res.status(400).json({ ok: false, error: { code: "INGEST_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
