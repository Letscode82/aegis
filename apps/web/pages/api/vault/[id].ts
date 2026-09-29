/**
 * GET /api/vault/[id] — a vault + its documents (V1). Gated knowledge:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma } from "@aegis/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.KnowledgeReadAll);
    const id = typeof req.query.id === "string" ? req.query.id : "";
    const vault = await prisma.vault.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
    });
    if (!vault) return res.status(404).json({ ok: false, error: "Vault not found." });

    const documents = await prisma.document.findMany({
      where: { organizationId: user.organizationId, ownerType: "VAULT", ownerId: id },
      orderBy: { uploadedAt: "desc" },
      take: 500,
      select: { id: true, name: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });
    return res.status(200).json({ ok: true, vault, documents });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
