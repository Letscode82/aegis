import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  IllegalMatterTransitionError,
  transitionMatterStatus,
  type MatterStatus,
} from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";
import { serializeMatter } from "../../../../lib/matter-serialize";

const VALID: MatterStatus[] = [
  "DRAFT",
  "OPEN",
  "ACTIVE",
  "STAYED",
  "CLOSED",
  "ARCHIVED",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;

  const body = (req.body ?? {}) as { to?: string; reason?: string };
  if (!body.to || !VALID.includes(body.to as MatterStatus)) {
    return res.status(400).json({ error: "Invalid target status" });
  }
  if (body.to === "CLOSED") {
    return res.status(400).json({
      error:
        "Use POST /api/matter/:id/close to transition to CLOSED — the closeout checklist is enforced there.",
    });
  }

  try {
    const updated = await transitionMatterStatus(
      id,
      body.to as MatterStatus,
      actor,
      body.reason,
    );
    res.status(200).json(serializeMatter(updated));
  } catch (err) {
    if (err instanceof IllegalMatterTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[/api/matter/:id/transition] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
