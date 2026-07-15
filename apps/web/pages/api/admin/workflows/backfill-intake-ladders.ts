/**
 * POST /api/admin/workflows/backfill-intake-ladders
 *
 * One-shot backfill: attach a governance ladder to every open intake
 * ticket that doesn't already have one. Auto-ladder normally fires at
 * ticket-CREATION time (maybeStartWorkflowForTicket); tickets created
 * before the library was seeded have no ladder, so this brings them into
 * the dispatch flow. Idempotent — a ticket that already has an instance
 * is skipped; a ticket whose type maps to no seeded ladder is counted
 * as "no match" and left as-is.
 *
 * Gated admin:manage_users (same as the library seed). Audited.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma, logAudit } from "@aegis/db";
import { maybeStartWorkflowForTicket } from "@aegis/intake/workflow-bridge";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.AdminManageUsers);
  } catch (err) {
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }

  const orgId = user.organizationId;
  // Open tickets only — no point laddering closed/complete ones.
  const tickets = await prisma.intakeTicket.findMany({
    where: { organizationId: orgId, stage: { notIn: ["complete", "closed"] } },
    select: {
      id: true, type: true, requestTypeId: true, department: true, description: true,
      priority: true, slaHours: true, submittedAt: true, requestFieldValuesJson: true,
    },
  });

  let laddered = 0;
  let already = 0;
  let noMatch = 0;
  for (const t of tickets) {
    const existing = await prisma.workflowInstance.findFirst({
      where: { organizationId: orgId, entityType: "intake_ticket", entityId: t.id },
      select: { id: true },
    });
    if (existing) {
      already++;
      continue;
    }
    const instanceId = await maybeStartWorkflowForTicket(
      orgId,
      {
        id: t.id,
        type: t.type,
        requestTypeId: t.requestTypeId,
        from: null,
        dept: t.department,
        desc: t.description,
        priority: t.priority,
        slaHours: t.slaHours,
        submittedTs: t.submittedAt ? t.submittedAt.getTime() : null,
        requestFieldValues:
          t.requestFieldValuesJson && typeof t.requestFieldValuesJson === "object"
            ? (t.requestFieldValuesJson as Record<string, unknown>)
            : null,
      },
      user.id,
    );
    if (instanceId) laddered++;
    else noMatch++;
  }

  await logAudit({
    organizationId: orgId,
    actorId: user.id,
    actorType: "USER",
    action: "workflow.intake.backfilled",
    resourceType: "WorkflowInstance",
    resourceId: "intake-backfill",
    afterJson: { laddered, already, noMatch, scanned: tickets.length },
    metadata: { source: "admin" },
  });

  return res.status(200).json({ ok: true, laddered, already, noMatch, scanned: tickets.length });
}
