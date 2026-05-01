import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  CloseoutChecklistIncompleteError,
  IllegalMatterTransitionError,
  closeMatter,
} from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";
import { serializeMatter } from "../../../../lib/matter-serialize";

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
  const actor = await requireActor(req, res, Permission.MatterClose);
  if (!actor) return;

  const body = (req.body ?? {}) as { closureNote?: string };

  try {
    const updated = await closeMatter(id, actor, {
      closureNote: body.closureNote,
    });
    res.status(200).json(serializeMatter(updated));
  } catch (err) {
    if (err instanceof CloseoutChecklistIncompleteError) {
      return res.status(409).json({
        error: err.message,
        missing: err.missing,
      });
    }
    if (err instanceof IllegalMatterTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[/api/matter/:id/close] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
