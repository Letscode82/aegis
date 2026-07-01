/**
 * GET    /api/admin/intake/request-types/[id]  — one type (+fields)
 * PUT    /api/admin/intake/request-types/[id]  — update (replaces fields when provided)
 * DELETE /api/admin/intake/request-types/[id]  — remove
 *
 * Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getRequestType,
  updateRequestType,
  deleteRequestType,
  RequestTypeNotFoundError,
  RequestTypeValidationError,
} from "@aegis/intake/request-types";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";

  try {
    if (req.method === "GET") {
      const type = await getRequestType(actor.organizationId, id);
      if (!type) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, type });
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const type = await updateRequestType(
        actor.organizationId,
        id,
        {
          key: typeof body.key === "string" ? body.key : "",
          name: typeof body.name === "string" ? body.name : "",
          workstream: typeof body.workstream === "string" ? body.workstream : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          active: typeof body.active === "boolean" ? body.active : undefined,
          stages: Array.isArray(body.stages) ? (body.stages as string[]) : undefined,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
          fields: Array.isArray(body.fields) ? (body.fields as never[]) : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, type });
    }
    if (req.method === "DELETE") {
      await deleteRequestType(actor.organizationId, id, { req, res });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof RequestTypeNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (err instanceof RequestTypeValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/admin/intake/request-types/[id]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
