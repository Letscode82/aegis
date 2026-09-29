/**
 * GET  /api/vault      — list the org's vaults (V1).
 * POST /api/vault      — create a vault.
 *
 * A Vault is a project collection of documents for cross-document review +
 * cited Q&A. Reads gated knowledge:read_all; create gated knowledge:contribute.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma, logAudit } from "@aegis/db";
import { assertAndAudit } from "../../../lib/authz";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.KnowledgeReadAll);
      const vaults = await prisma.vault.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
      });
      // Attach a document count per vault (shared Document rows, ownerType VAULT).
      const counts = await prisma.document.groupBy({
        by: ["ownerId"],
        where: { organizationId: user.organizationId, ownerType: "VAULT" },
        _count: { _all: true },
      });
      const countMap = new Map(counts.map((c) => [c.ownerId, c._count._all]));
      return res.status(200).json({ ok: true, vaults: vaults.map((v) => ({ ...v, documentCount: countMap.get(v.id) || 0 })) });
    }

    if (req.method === "POST") {
      await assertAndAudit(user, Permission.KnowledgeContribute, { resourceType: "Vault", route: "vault.create" });
      const body = (req.body || {}) as Record<string, unknown>;
      const name = (typeof body.name === "string" ? body.name : "").trim().slice(0, 160);
      const description = (typeof body.description === "string" ? body.description : "").trim().slice(0, 1000) || null;
      if (!name) return res.status(400).json({ ok: false, error: "A vault name is required." });
      const vault = await prisma.vault.create({
        data: { organizationId: user.organizationId, name, description, createdById: user.id },
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
      });
      await logAudit({
        organizationId: user.organizationId,
        actorId: user.id,
        actorType: "USER",
        action: "vault.created",
        resourceType: "Vault",
        resourceId: vault.id,
        afterJson: { name, description },
        metadata: { source: "vault" },
      });
      return res.status(201).json({ ok: true, vault: { ...vault, documentCount: 0 } });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
