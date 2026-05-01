import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  UserAlreadyExistsError,
  inviteUser,
  listUsers,
  type UserStatus,
} from "@aegis/admin";
import { requireActor } from "../../../../lib/matter-actor";

const STATUSES = new Set<UserStatus>(["ACTIVE", "SUSPENDED", "PENDING_INVITE"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  if (req.method === "GET") {
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const roleId =
      typeof req.query.roleId === "string" ? req.query.roleId : undefined;
    const statusRaw =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusRaw && STATUSES.has(statusRaw as UserStatus)
        ? (statusRaw as UserStatus)
        : undefined;
    const page = Number(req.query.page) || 1;
    try {
      const out = await listUsers(actor.organizationId, {
        search,
        roleId,
        status,
        page,
        pageSize: 50,
      });
      return res.status(200).json(out);
    } catch (err) {
      console.error("[/api/admin/users GET] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      email?: string;
      name?: string;
      roleId?: string;
    };
    if (!body.email?.trim() || !body.roleId) {
      return res.status(400).json({ error: "email and roleId are required" });
    }
    try {
      const created = await inviteUser(
        {
          email: body.email,
          name: body.name ?? "",
          roleId: body.roleId,
        },
        actor,
      );
      return res.status(201).json(created);
    } catch (err) {
      if (err instanceof UserAlreadyExistsError) {
        return res.status(409).json({ error: err.message });
      }
      console.error("[/api/admin/users POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
