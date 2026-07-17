/**
 * Template store (Templates DB) — the editable NDA / contract / notice
 * drafts the agents draft from. Homed here alongside the clause library
 * so playbooks AND templates live in one DB-backed admin surface: edit a
 * template and the agent that drafts from it produces the new text.
 * Reads feed the agents + admin list; writes are chain-sealed and gated
 * at the route.
 */
import { prisma, logAudit } from "@aegis/db";
import type { TemplateKind } from "@aegis/db";

export interface TemplateDTO {
  id: string;
  kind: "NDA" | "CONTRACT" | "NOTICE" | "OTHER";
  key: string;
  name: string;
  body: string;
  description: string | null;
  version: number;
  active: boolean;
  sortOrder: number;
}

export interface UpsertTemplateInput {
  kind: TemplateKind;
  key: string;
  name: string;
  body: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const toDTO = (t: {
  id: string; kind: TemplateKind; key: string; name: string; body: string;
  description: string | null; version: number; active: boolean; sortOrder: number;
}): TemplateDTO => ({
  id: t.id, kind: t.kind, key: t.key, name: t.name, body: t.body,
  description: t.description, version: t.version, active: t.active, sortOrder: t.sortOrder,
});

export async function listTemplates(
  organizationId: string,
  opts?: { kind?: TemplateKind; includeInactive?: boolean },
): Promise<TemplateDTO[]> {
  const rows = await prisma.template.findMany({
    where: {
      organizationId,
      ...(opts?.kind ? { kind: opts.kind } : {}),
      ...(opts?.includeInactive ? {} : { active: true }),
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toDTO);
}

/** Resolve one template by key (active only) — for the agents. */
export async function getTemplateByKey(organizationId: string, key: string): Promise<TemplateDTO | null> {
  const t = await prisma.template.findFirst({ where: { organizationId, key, active: true } });
  return t ? toDTO(t) : null;
}

/** First active template of a kind — the agent's default draft source. */
export async function getDefaultTemplateForKind(organizationId: string, kind: TemplateKind): Promise<TemplateDTO | null> {
  const t = await prisma.template.findFirst({
    where: { organizationId, kind, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return t ? toDTO(t) : null;
}

/** Upsert on (org, key); chain-sealed; bumps version on body change. */
export async function upsertTemplate(
  organizationId: string,
  input: UpsertTemplateInput,
  actor: Actor,
): Promise<TemplateDTO> {
  const key = input.key.trim().toLowerCase();
  if (!key) throw new Error("key is required");
  if (!input.name.trim()) throw new Error("name is required");
  if (!input.body.trim()) throw new Error("body is required");

  const existing = await prisma.template.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  const bodyChanged = existing && existing.body !== input.body;

  const data = {
    kind: input.kind,
    name: input.name.trim(),
    body: input.body,
    description: input.description?.trim() || null,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };

  const t = existing
    ? await prisma.template.update({
        where: { id: existing.id },
        data: { ...data, version: bodyChanged ? existing.version + 1 : existing.version },
      })
    : await prisma.template.create({ data: { organizationId, key, ...data } });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: existing ? "contract.template.updated" : "contract.template.created",
    resourceType: "Template",
    resourceId: t.id,
    afterJson: { kind: t.kind, key: t.key, name: t.name, version: t.version, active: t.active } as never,
    metadata: { source: "contracts" } as never,
  });
  return toDTO(t);
}

export async function deleteTemplate(organizationId: string, id: string, actor: Actor): Promise<void> {
  const t = await prisma.template.findFirst({ where: { id, organizationId } });
  if (!t) throw new Error("Template not found");
  await prisma.template.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.template.deleted",
    resourceType: "Template",
    resourceId: id,
    beforeJson: { kind: t.kind, key: t.key, name: t.name } as never,
    metadata: { source: "contracts" } as never,
  });
}
