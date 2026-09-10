/**
 * GET /api/notices/cockpit[?status=&type=&source=&horizonDays=]
 *
 * Notice & obligation cockpit — the unified deadline board over the shared
 * Obligation entity (the "one brain" surface). Obligations are written by
 * Contracts, Regulatory, Governance and Privacy against the same table; this
 * reads them all in one place with urgency buckets. Inbound-notice capture
 * (P#3) and outbound issuance (P#4) feed this same board.
 *
 * Read aggregation only — no new tables. Gated on any of the notice-adjacent
 * read permissions so counsel, legal-ops and compliance roles all see it.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActorAny } from "../../../lib/matter-actor";

const ACTIVE = ["OPEN", "IN_PROGRESS"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActorAny(req, res, [
    Permission.RegulatoryRead,
    Permission.ContractsReadAll,
    Permission.MatterReadAll,
  ]);
  if (!actor) return;

  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" && v !== "ALL" ? v.trim() : undefined);
  const horizonDays = typeof req.query.horizonDays === "string" && !Number.isNaN(Number(req.query.horizonDays))
    ? Math.min(Math.max(Number(req.query.horizonDays), 1), 365)
    : 30;

  const where: Record<string, unknown> = { organizationId: actor.organizationId };
  const status = str(req.query.status);
  const type = str(req.query.type);
  const source = str(req.query.source);
  if (status) where.status = status;
  if (type) where.type = type;
  if (source) where.sourceType = source;

  try {
    const rows = await prisma.obligation.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 500,
    });

    const now = Date.now();
    const soon = now + horizonDays * 86_400_000;
    const isActive = (s: string) => (ACTIVE as readonly string[]).includes(s);

    const items = rows.map((o) => {
      const due = o.dueDate ? new Date(o.dueDate).getTime() : null;
      const overdue = due != null && due < now && isActive(o.status);
      const dueSoon = due != null && due >= now && due <= soon && isActive(o.status);
      return {
        id: o.id,
        description: o.description,
        sourceType: o.sourceType,
        type: o.type,
        status: o.status,
        dueDate: o.dueDate ? new Date(o.dueDate).toISOString() : null,
        ownerId: o.ownerId,
        recurrence: o.recurrence,
        overdue,
        dueSoon,
      };
    });

    const summary = {
      total: items.length,
      overdue: items.filter((i) => i.overdue).length,
      dueSoon: items.filter((i) => i.dueSoon).length,
      open: items.filter((i) => isActive(i.status)).length,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };
    for (const i of items) {
      summary.byType[i.type] = (summary.byType[i.type] || 0) + 1;
      summary.bySource[i.sourceType] = (summary.bySource[i.sourceType] || 0) + 1;
      summary.byStatus[i.status] = (summary.byStatus[i.status] || 0) + 1;
    }

    return res.status(200).json({ ok: true, horizonDays, items, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "COCKPIT_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
