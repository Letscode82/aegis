/**
 * GET  /api/admin/intake/request-types   — list request types (+fields)
 * POST /api/admin/intake/request-types   — create one
 *
 * Configurable intake workstreams (Phase 1). Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listRequestTypes,
  createRequestType,
  RequestTypeValidationError,
} from "@aegis/intake/request-types";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  if (req.method === "GET") {
    const includeInactive = req.query.all === "1" || req.query.all === "true";
    const types = await listRequestTypes(actor.organizationId, { includeInactive });
    return res.status(200).json({ ok: true, types });
  }
  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const type = await createRequestType(
        actor.organizationId,
        {
          key: typeof body.key === "string" ? body.key : "",
          name: typeof body.name === "string" ? body.name : "",
          workstream: typeof body.workstream === "string" ? body.workstream : null,
          description: typeof body.description === "string" ? body.description : null,
          active: typeof body.active === "boolean" ? body.active : undefined,
          stages: Array.isArray(body.stages) ? (body.stages as string[]) : undefined,
          workflowKey:
            body.workflowKey === null
              ? null
              : typeof body.workflowKey === "string"
                ? body.workflowKey
                : undefined,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
          fields: Array.isArray(body.fields) ? (body.fields as never[]) : undefined,
        },
        { req, res },
      );
      return res.status(201).json({ ok: true, type });
    } catch (err) {
      if (err instanceof RequestTypeValidationError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        return res.status(409).json({ ok: false, error: "A request type with that key already exists." });
      }
      console.error("[/api/admin/intake/request-types] POST failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
