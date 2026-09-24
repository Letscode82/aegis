/**
 * Workspace assistant (WS-4) — the "Ask AEGIS about this Space" backend.
 *
 * Two capabilities, both matter-scoped:
 *   - getMatterAskContext: assembles a compact, matter-scoped context (title,
 *     type, status, description, open tasks) that the apps/web /ask route feeds
 *     to @aegis/ai for a scoped answer.
 *   - Artifacts: AI-generated drafts saved to the matter. These are the SHARED
 *     `Document` entity (ownerType=MATTER) with the generated text stored inline
 *     in `extractedText` — no new table, no re-implemented entity. Artifacts are
 *     distinguished from uploaded files by the `inline://artifact/` storageUrl
 *     marker. Every save is chain-sealed.
 */
import { prisma, logAudit } from "@aegis/db";

const ARTIFACT_PREFIX = "inline://artifact/";

export interface MatterAskContext {
  matterId: string;
  title: string;
  type: string;
  status: string;
  description: string | null;
  openTasks: string[];
}

export async function getMatterAskContext(
  organizationId: string,
  matterId: string,
): Promise<MatterAskContext | null> {
  const m = await prisma.matter.findFirst({ where: { id: matterId, organizationId } });
  if (!m) return null;
  const tasks = await prisma.matterTask.findMany({
    where: { matterId, completedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: 12,
    select: { title: true },
  });
  return {
    matterId,
    title: m.title,
    type: String(m.type),
    status: String(m.status),
    description: m.description ?? null,
    openTasks: tasks.map((t) => t.title),
  };
}

export interface MatterArtifactDTO {
  id: string;
  name: string;
  createdAt: string;
  uploadedBy: string;
  sizeBytes: number;
  preview: string;
}

export async function listMatterArtifacts(
  organizationId: string,
  matterId: string,
): Promise<MatterArtifactDTO[]> {
  const rows = await prisma.document.findMany({
    where: {
      organizationId,
      ownerType: "MATTER" as never,
      ownerId: matterId,
      storageUrl: { startsWith: ARTIFACT_PREFIX },
    },
    orderBy: [{ uploadedAt: "desc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    createdAt: d.uploadedAt.toISOString(),
    uploadedBy: d.uploadedBy,
    sizeBytes: d.sizeBytes,
    preview: (d.extractedText ?? "").slice(0, 280),
  }));
}

export interface MatterArtifactDetail extends MatterArtifactDTO {
  content: string;
}

export async function getMatterArtifact(
  organizationId: string,
  matterId: string,
  id: string,
): Promise<MatterArtifactDetail | null> {
  const d = await prisma.document.findFirst({
    where: { id, organizationId, ownerType: "MATTER" as never, ownerId: matterId, storageUrl: { startsWith: ARTIFACT_PREFIX } },
  });
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    createdAt: d.uploadedAt.toISOString(),
    uploadedBy: d.uploadedBy,
    sizeBytes: d.sizeBytes,
    preview: (d.extractedText ?? "").slice(0, 280),
    content: d.extractedText ?? "",
  };
}

export async function createMatterArtifact(
  organizationId: string,
  matterId: string,
  input: { name?: string; content?: string; sourcePrompt?: string },
  actorId: string,
): Promise<{ id: string }> {
  const m = await prisma.matter.findFirst({ where: { id: matterId, organizationId }, select: { id: true } });
  if (!m) throw new Error("Matter not found");
  const name = String(input.name || "").trim().slice(0, 200) || "Untitled draft";
  const content = String(input.content || "");
  if (!content.trim()) throw new Error("Artifact content is empty");
  const row = await prisma.document.create({
    data: {
      organizationId,
      name,
      mimeType: "text/markdown",
      sizeBytes: content.length,
      storageUrl: ARTIFACT_PREFIX + Math.random().toString(36).slice(2, 14),
      version: 1,
      ownerType: "MATTER" as never,
      ownerId: matterId,
      uploadedBy: actorId,
      extractedText: content,
    },
  });
  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "matter.artifact.created",
    resourceType: "Document",
    resourceId: row.id,
    afterJson: { name, sourcePrompt: input.sourcePrompt ?? null } as never,
    metadata: { source: "workspace-assistant" } as never,
  });
  return { id: row.id };
}
