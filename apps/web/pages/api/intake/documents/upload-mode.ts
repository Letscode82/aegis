/**
 * GET /api/intake/documents/upload-mode — which upload path the New
 * Request form should use (W4-6). "direct" (Vercel Blob connected,
 * 25 MB) or "inline" (base64 JSON body, 3 MB). Gated like the upload
 * itself.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getUploadMode } from "@aegis/intake/documents-blob";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeCreateTicket);
  if (!actor) return;
  return res.status(200).json({ ok: true, ...getUploadMode() });
}
