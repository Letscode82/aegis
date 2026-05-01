import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { UserNotFoundError, getUserActivity } from "@aegis/admin";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = req.query.userId;
  if (typeof userId !== "string") {
    return res.status(400).json({ error: "Invalid userId" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const rows = await getUserActivity(userId, actor.organizationId);
    return res.status(200).json(rows);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[/api/admin/users/:userId/activity] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
