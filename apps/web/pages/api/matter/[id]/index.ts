import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getMatterById,
  updateMatter,
  type UpdateMatterInput,
} from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../../lib/matter-actor";
import { serializeMatter } from "../../../../lib/matter-serialize";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
    ]);
    if (!actor) return;
    const matter = await getMatterById(id);
    if (!matter || matter.organizationId !== actor.organizationId) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(serializeMatter(matter));
  }

  if (req.method === "PATCH") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    const body = (req.body ?? {}) as UpdateMatterInput;
    try {
      const updated = await updateMatter(id, body, actor);
      return res.status(200).json(serializeMatter(updated));
    } catch (err) {
      console.error("[/api/matter/:id PATCH] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
