import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  LastAdminProtectedError,
  UserNotFoundError,
  suspendUser,
} from "@aegis/admin";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = req.query.userId;
  if (typeof userId !== "string") {
    return res.status(400).json({ error: "Invalid userId" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  if (userId === actor.id) {
    return res
      .status(409)
      .json({ error: "You cannot suspend yourself." });
  }

  try {
    const updated = await suspendUser(userId, actor);
    return res.status(200).json(updated);
  } catch (err) {
    if (err instanceof LastAdminProtectedError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof UserNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[/api/admin/users/:userId/suspend] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
