/**
 * POST /api/matter/people — create a new Person row.
 *
 * Surfaced by the Hold Wizard's Step 2 inline "Add new custodian"
 * form (sub-PR 4d.0). The new Person joins the org and is
 * immediately picker-eligible.
 *
 * Permission: matter:update — same gate as the search endpoint
 * since both feed the same picker UX.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { findOrCreatePersonByEmail, logAudit } from "@aegis/db";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;
  const body = (req.body ?? {}) as {
    name?: string;
    email?: string;
    department?: string;
  };
  if (!body.name?.trim() || !body.email?.trim()) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_BODY",
        message: "name + email required",
      },
    });
  }
  // Guardrail: reuse an existing Person for this (org, email) instead of ever
  // minting a duplicate — this is the recurrence fix for the duplicate-custodian
  // problem. Person has no top-level `department` column; the polymorphic
  // metadata bag carries it for picker UX without a schema bump.
  const { person, created } = await findOrCreatePersonByEmail(actor.organizationId, {
    email: body.email.trim(),
    name: body.name.trim(),
    type: "EMPLOYEE",
    metadata: body.department?.trim() ? { department: body.department.trim() } : null,
  });
  if (created) {
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "person.created",
      resourceType: "Person",
      resourceId: person.id,
      metadata: { source: "hold-wizard" },
    });
  }
  return res.status(created ? 201 : 200).json({
    id: person.id, name: person.name, email: person.email, type: person.type, metadata: person.metadata, reused: !created,
  });
}
