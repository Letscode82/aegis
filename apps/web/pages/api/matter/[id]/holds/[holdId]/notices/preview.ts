/**
 * POST /api/matter/[id]/holds/[holdId]/notices/preview
 *
 * Renders a template against the hold's context for the composer
 * wizard's step 2. Body:
 *   { templateId, previewCustodianPersonId? }
 *
 * Returns { template, rawBody, renderedBody, previewCustodian, recipients }.
 *
 * Pure read — no audit row, no mutation. Gated by
 * `matter:legal_hold:issue` so the preview surface tracks the
 * mutation gate.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getNoticeComposerPreview } from "@aegis/matter";
import { requireActor } from "../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({ error: "Invalid holdId" });
  }

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const body = (req.body ?? {}) as {
    templateId?: string;
    previewCustodianPersonId?: string;
  };
  if (!body.templateId)
    return res.status(400).json({ error: "templateId required" });

  try {
    const preview = await getNoticeComposerPreview(
      {
        holdId,
        templateId: body.templateId,
        previewCustodianPersonId: body.previewCustodianPersonId,
      },
      actor,
    );
    return res.status(200).json(preview);
  } catch (err) {
    console.error("[notices/preview] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
