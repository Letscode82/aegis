/**
 * POST /api/intake/documents/blob-upload — client-upload token broker
 * (W4-6). The browser's @vercel/blob `upload()` calls this to get a
 * scoped one-shot token, then streams the ORIGINAL bytes straight to
 * blob storage — the serverless 4.5 MB request cap never applies.
 *
 * Gated on intake:create_ticket (same as the inline upload). Tokens
 * are constrained server-side: allowed content types, 25 MB ceiling,
 * random suffix so filenames can't collide/overwrite. The Document
 * row is created by the finalize endpoint, not here.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { Permission } from "@aegis/auth";
import { MAX_DIRECT_BYTES, isBlobConfigured } from "@aegis/intake/documents-blob";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!isBlobConfigured()) {
    return res.status(503).json({
      ok: false,
      error: "Direct upload not configured — connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN).",
    });
  }
  const actor = await requireActor(req, res, Permission.IntakeCreateTicket);
  if (!actor) return;

  try {
    const result = await handleUpload({
      request: req,
      body: req.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: [
          "text/plain",
          "text/markdown",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        maximumSizeInBytes: MAX_DIRECT_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ actorId: actor.id, pathname }),
      }),
      // The Document row + audit are written by /finalize (called by
      // the client after the upload completes) — this callback can't
      // reach localhost in dev and is deliberately not relied upon.
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : "Upload token request failed",
    });
  }
}
