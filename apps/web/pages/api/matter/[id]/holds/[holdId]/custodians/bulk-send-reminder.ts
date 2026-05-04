/**
 * POST /api/matter/[id]/holds/[holdId]/custodians/bulk-send-reminder
 *
 * Sends one notice issuance to a specific subset of custodians.
 * Body: { templateId, personIds, editedBody? }
 *
 * Thin shim over composeAndSendNotice — the composer already
 * supports a recipient subset and writes one REMINDER_SENT event
 * per custodian. The bulk dialog uses this when the user wants to
 * send a reminder to a checkbox-selected subset rather than
 * walking through the full composer wizard.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { bulkSendReminder } from "@aegis/matter";
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
    personIds?: string[];
    editedBody?: string;
  };
  if (!body.templateId) {
    return res.status(400).json({ error: "templateId required" });
  }
  if (!Array.isArray(body.personIds) || body.personIds.length === 0) {
    return res.status(400).json({ error: "personIds required" });
  }

  try {
    const result = await bulkSendReminder(
      {
        holdId,
        templateId: body.templateId,
        personIds: body.personIds,
        editedBody: body.editedBody,
      },
      actor,
    );
    return res.status(201).json(result);
  } catch (err) {
    console.error("[bulk-send-reminder] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
