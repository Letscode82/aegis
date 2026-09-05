/**
 * POST /api/review/ingest-archive/blob-upload — PROC-6 / A2.
 *
 * Client-upload token endpoint for @vercel/blob. The browser uploads the
 * archive straight to Blob storage (bypassing Vercel's ~4.5 MB request limit),
 * then POSTs the resulting blob URL to /api/review/ingest-archive.
 *
 * Requires a Blob store attached to the project (BLOB_READ_WRITE_TOKEN). The
 * token-generation phase is gated on matter:legal_hold:issue; the Vercel
 * upload-completed callback has no session, so it is not gated.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { Permission } from "@aegis/auth";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const body = req.body as HandleUploadBody;

  // Gate only the token-generation phase (it carries the user session). The
  // upload-completed callback is a server-to-server call from Vercel Blob.
  if ((body as { type?: string })?.type === "blob.generate-client-token") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/zip",
          "application/x-zip-compressed",
          "application/mbox",
          "application/octet-stream",
          "message/rfc822",
        ],
        maximumSizeInBytes: 40_000_000,
      }),
      onUploadCompleted: async () => {
        // No-op: ingestion is triggered explicitly by the client posting the
        // blob URL to /api/review/ingest-archive.
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(400).json({ ok: false, error: { code: "BLOB_UPLOAD_TOKEN_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
