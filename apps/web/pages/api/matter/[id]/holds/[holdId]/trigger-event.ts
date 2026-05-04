/**
 * Trigger event endpoint (sub-PR 4c.4, Item 9).
 *
 * GET  — return the latest HoldTriggerEvent for the hold (or 200
 *        with `null` when none recorded yet).
 * POST — record the FIRST trigger event when none exists.
 *        Body: { eventDescription: string, occurredAt?: string (ISO) }
 * PUT  — edit an existing trigger event by id.
 *        Body: { triggerEventId, eventDescription, occurredAt? }
 *
 * GET inherits the matter-read triple (any read perm grants).
 * POST + PUT require `matter:legal_hold:issue` (mutation gate).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getHoldTriggerEvent,
  recordHoldTrigger,
  updateHoldTrigger,
} from "@aegis/matter";
import {
  requireActor,
  requireActorAny,
} from "../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({ error: "Invalid holdId" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const t = await getHoldTriggerEvent(holdId, actor.organizationId);
    return res.status(200).json(t);
  }

  if (req.method === "POST") {
    const actor = await requireActor(
      req,
      res,
      Permission.MatterLegalHoldIssue,
    );
    if (!actor) return;
    const body = (req.body ?? {}) as {
      eventDescription?: string;
      occurredAt?: string;
    };
    if (!body.eventDescription || body.eventDescription.trim().length === 0) {
      return res.status(400).json({ error: "eventDescription required" });
    }
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return res.status(400).json({ error: "occurredAt is not a valid date" });
    }
    try {
      await recordHoldTrigger(
        holdId,
        body.eventDescription.trim(),
        occurredAt,
        actor,
      );
      const created = await getHoldTriggerEvent(holdId, actor.organizationId);
      return res.status(201).json(created);
    } catch (err) {
      console.error("[trigger-event POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === "PUT") {
    const actor = await requireActor(
      req,
      res,
      Permission.MatterLegalHoldIssue,
    );
    if (!actor) return;
    const body = (req.body ?? {}) as {
      triggerEventId?: string;
      eventDescription?: string;
      occurredAt?: string;
    };
    if (!body.triggerEventId) {
      return res.status(400).json({ error: "triggerEventId required" });
    }
    if (!body.eventDescription || body.eventDescription.trim().length === 0) {
      return res.status(400).json({ error: "eventDescription required" });
    }
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      return res.status(400).json({ error: "occurredAt is not a valid date" });
    }
    try {
      await updateHoldTrigger(
        {
          holdId,
          triggerEventId: body.triggerEventId,
          eventDescription: body.eventDescription.trim(),
          occurredAt,
        },
        actor,
      );
      const updated = await getHoldTriggerEvent(holdId, actor.organizationId);
      return res.status(200).json(updated);
    } catch (err) {
      console.error("[trigger-event PUT] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST,PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
