/**
 * POST /api/notices/outbound
 *   { description, type, sourceType, dueDate?, recurrence?, counterparty?, body? }
 *   → { ok, obligation }
 *
 * Creates a tracked OUTBOUND notice as a shared Obligation row (the same
 * entity the Notice cockpit reads), then chain-seals an AuditLog entry. The
 * notice body drafted via /api/notices/draft is stored on metadata for the
 * record; real delivery (email) is a separate, documented stub.
 *
 * Conservative-AI: the human fills/edits and submits this form — nothing the
 * model produced is written without this explicit action. Gated on
 * regulatory:flag_obligation (the canonical "create an obligation" grant).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma, logAudit } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

const TYPES = new Set(["PAYMENT", "DELIVERABLE", "REPORTING", "RENEWAL_NOTICE", "COMPLIANCE", "OTHER"]);
const SOURCES = new Set(["CONTRACT", "REGULATION", "POLICY", "PRIVACY_LAW"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.RegulatoryFlagObligation);
  if (!actor) return;

  const description = String(req.body?.description || "").trim().slice(0, 500);
  const type = String(req.body?.type || "OTHER").toUpperCase();
  const sourceType = String(req.body?.sourceType || "POLICY").toUpperCase();
  const counterparty = String(req.body?.counterparty || "").trim().slice(0, 200);
  const noticeBody = String(req.body?.body || "").slice(0, 20000);
  const recurrence = req.body?.recurrence ? String(req.body.recurrence).trim().slice(0, 200) : null;
  let dueDate: Date | null = null;
  if (req.body?.dueDate) {
    const d = new Date(String(req.body.dueDate));
    if (!Number.isNaN(d.getTime())) dueDate = d;
  }

  if (!description) return res.status(400).json({ ok: false, error: { code: "MISSING_DESCRIPTION", message: "A notice description is required." } });
  if (!TYPES.has(type)) return res.status(400).json({ ok: false, error: { code: "BAD_TYPE", message: `type must be one of ${[...TYPES].join(", ")}` } });
  if (!SOURCES.has(sourceType)) return res.status(400).json({ ok: false, error: { code: "BAD_SOURCE", message: `sourceType must be one of ${[...SOURCES].join(", ")}` } });

  try {
    const obligation = await prisma.obligation.create({
      data: {
        organizationId: actor.organizationId,
        sourceType: sourceType as never,
        sourceId: `notice-manual:${actor.id}`,
        description,
        type: type as never,
        dueDate,
        recurrence,
        status: "OPEN",
        ownerId: null,
        metadata: {
          direction: "outbound",
          createdVia: "notice-cockpit",
          counterparty: counterparty || null,
          noticeBody: noticeBody || null,
          deliveryStubbed: true,
        },
      },
    });

    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "notice.obligation.created",
      resourceType: "Obligation",
      resourceId: obligation.id,
      afterJson: { description, type, sourceType, dueDate: dueDate?.toISOString() ?? null, direction: "outbound" },
      metadata: { source: "notice-cockpit", deliveryStubbed: true },
    });

    return res.status(200).json({
      ok: true,
      obligation: { id: obligation.id, description: obligation.description, type: obligation.type, sourceType: obligation.sourceType, dueDate: obligation.dueDate?.toISOString() ?? null, status: obligation.status },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "CREATE_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
