/**
 * POST /api/vault/[id]/upload — file a document into a vault (V1).
 *
 * Extracts text (@aegis/documents), persists a shared Document (ownerType
 * VAULT, ownerId = vault id), indexes it (@aegis/search, best-effort), and
 * writes a chain-sealed audit row. Gated knowledge:contribute.
 *
 * Body (JSON): { filename, mimeType?, contentBase64 }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma, logAudit, DocumentOwnerType } from "@aegis/db";
import { extractDocumentText, UnsupportedDocumentFormatError, DocumentParseError } from "@aegis/documents";
import { indexResource } from "@aegis/search";
import { assertAndAudit } from "../../../../lib/authz";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };
const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const vaultId = typeof req.query.id === "string" ? req.query.id : "";
    await assertAndAudit(user, Permission.KnowledgeContribute, { resourceType: "Vault", resourceId: vaultId, route: "vault.upload" });
    const vault = await prisma.vault.findFirst({ where: { id: vaultId, organizationId: user.organizationId }, select: { id: true } });
    if (!vault) return res.status(404).json({ ok: false, error: "Vault not found." });

    const body = (req.body || {}) as Record<string, unknown>;
    const filename = (typeof body.filename === "string" ? body.filename : "").trim() || "document";
    const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
    if (!contentBase64) return res.status(400).json({ ok: false, error: "No file content provided." });

    const buf = Buffer.from(contentBase64, "base64");
    if (buf.length === 0) return res.status(400).json({ ok: false, error: "Uploaded file is empty." });
    if (buf.length > MAX_BYTES) return res.status(400).json({ ok: false, error: "File is too large (max 3 MB)." });

    const { format, text } = extractDocumentText(filename, mimeType, buf);
    const resolvedMime =
      mimeType ||
      (format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : format === "pdf"
          ? "application/pdf"
          : "text/plain");

    const doc = await prisma.document.create({
      data: {
        organizationId: user.organizationId,
        name: filename,
        mimeType: resolvedMime,
        sizeBytes: buf.length,
        storageUrl: `inline://vault/${vaultId}/${encodeURIComponent(filename)}`,
        ownerType: DocumentOwnerType.VAULT,
        ownerId: vaultId,
        uploadedBy: user.id,
        extractedText: text,
      },
      select: { id: true },
    });
    // Touch the vault so it sorts to the top of the list.
    await prisma.vault.update({ where: { id: vaultId }, data: { updatedAt: new Date() } });

    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "vault.document.added",
      resourceType: "Document",
      resourceId: doc.id,
      afterJson: { name: filename, format, sizeBytes: buf.length, charCount: text.length, vaultId },
      metadata: { source: "vault-upload" },
    });

    try {
      await indexResource({ organizationId: user.organizationId, ownerType: "DOCUMENT", ownerId: doc.id, documentId: doc.id, text });
    } catch { /* best-effort */ }

    return res.status(201).json({ ok: true, documentId: doc.id, name: filename, format, sizeBytes: buf.length, charCount: text.length });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof UnsupportedDocumentFormatError || err instanceof DocumentParseError) {
      return res.status(400).json({ ok: false, error: (err as Error).message });
    }
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
