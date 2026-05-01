import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma, type Prisma } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AuditReadAll);
  if (!actor) return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 50;
  const where: Prisma.AuditLogWhereInput = {
    organizationId: actor.organizationId,
  };
  if (typeof req.query.resourceType === "string" && req.query.resourceType) {
    where.resourceType = req.query.resourceType;
  }
  if (typeof req.query.action === "string" && req.query.action) {
    where.action = { contains: req.query.action };
  }
  if (typeof req.query.actorId === "string" && req.query.actorId) {
    where.actorId = req.query.actorId;
  }
  if (typeof req.query.resourceId === "string" && req.query.resourceId) {
    where.resourceId = req.query.resourceId;
  }
  if (typeof req.query.fromDate === "string" && req.query.fromDate) {
    where.timestamp = {
      ...(where.timestamp as Record<string, unknown>),
      gte: new Date(req.query.fromDate),
    };
  }
  if (typeof req.query.toDate === "string" && req.query.toDate) {
    where.timestamp = {
      ...(where.timestamp as Record<string, unknown>),
      lte: new Date(req.query.toDate),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ chainPosition: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.status(200).json({
    rows: rows.map((r) => ({
      id: r.id,
      chainPosition: r.chainPosition.toString(),
      timestamp: r.timestamp.toISOString(),
      action: r.action,
      actorId: r.actorId,
      actorType: r.actorType,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      contentHash: r.contentHash,
      prevHash: r.prevHash,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
    })),
    total,
    page,
    pageSize,
  });
}
