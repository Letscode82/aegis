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
import { logAudit, prisma } from "@aegis/db";
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
  // Email-uniqueness within an org is a soft contract — Person
  // doesn't have a unique index on (organizationId, email), so an
  // explicit duplicate check keeps the picker UX sane.
  const existing = await prisma.person.findFirst({
    where: {
      organizationId: actor.organizationId,
      email: { equals: body.email.trim(), mode: "insensitive" },
    },
  });
  if (existing) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "DUPLICATE_EMAIL",
        message: `A person with email ${body.email} already exists.`,
      },
    });
  }
  const created = await prisma.person.create({
    data: {
      organizationId: actor.organizationId,
      name: body.name.trim(),
      email: body.email.trim(),
      type: "EMPLOYEE",
      // Person has no top-level `department` column; the polymorphic
      // metadata bag carries it for picker UX without a schema bump.
      metadata: body.department?.trim()
        ? { department: body.department.trim() }
        : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      type: true,
      metadata: true,
    },
  });
  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "person.created",
    resourceType: "Person",
    resourceId: created.id,
    metadata: { source: "hold-wizard" },
  });
  return res.status(201).json(created);
}
