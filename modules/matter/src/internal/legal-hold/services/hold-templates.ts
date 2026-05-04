/**
 * Hold scope templates (sub-PR 4c.4, Item 12).
 *
 * Pre-written scope language + default jurisdictions for common
 * litigation patterns. Selecting a template in the create-hold form
 * auto-fills the scope and jurisdictions; the user can edit before
 * submitting. Templates are org-scoped and unique by name.
 *
 * Mutations write a chain-sealed AuditLog row via the standard
 * `logAudit` helper — these aren't hold-lifecycle events (they're
 * org-admin actions), so we don't route through `recordHoldEvent`.
 */
import { logAudit, prisma, type HoldScopeTemplate } from "@aegis/db";

export interface HoldScopeTemplateDTO {
  id: string;
  name: string;
  description: string | null;
  scopeMarkdown: string;
  defaultJurisdictions: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHoldScopeTemplateInput {
  name: string;
  description?: string;
  scopeMarkdown: string;
  defaultJurisdictions?: string[];
}

export interface UpdateHoldScopeTemplateInput {
  templateId: string;
  name?: string;
  description?: string | null;
  scopeMarkdown?: string;
  defaultJurisdictions?: string[];
}

interface AdminActor {
  id: string;
  organizationId: string;
}

function toDTO(t: HoldScopeTemplate): HoldScopeTemplateDTO {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    scopeMarkdown: t.scopeMarkdown,
    defaultJurisdictions: t.defaultJurisdictions,
    createdById: t.createdById,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listHoldScopeTemplatesService(
  organizationId: string,
): Promise<HoldScopeTemplateDTO[]> {
  const rows = await prisma.holdScopeTemplate.findMany({
    where: { organizationId },
    orderBy: [{ name: "asc" }],
  });
  return rows.map(toDTO);
}

export async function getHoldScopeTemplateService(
  organizationId: string,
  templateId: string,
): Promise<HoldScopeTemplateDTO | null> {
  const t = await prisma.holdScopeTemplate.findFirst({
    where: { id: templateId, organizationId },
  });
  return t ? toDTO(t) : null;
}

export async function createHoldScopeTemplateService(
  input: CreateHoldScopeTemplateInput,
  actor: AdminActor,
): Promise<HoldScopeTemplateDTO> {
  if (!input.name?.trim()) throw new Error("name required");
  if (!input.scopeMarkdown?.trim())
    throw new Error("scopeMarkdown required");

  const created = await prisma.holdScopeTemplate.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      scopeMarkdown: input.scopeMarkdown,
      defaultJurisdictions: input.defaultJurisdictions ?? [],
      createdById: actor.id,
    },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "matter.legal_hold.scope_template.created",
    resourceType: "HoldScopeTemplate",
    resourceId: created.id,
    afterJson: {
      name: created.name,
      defaultJurisdictions: created.defaultJurisdictions,
    },
  });

  return toDTO(created);
}

export async function updateHoldScopeTemplateService(
  input: UpdateHoldScopeTemplateInput,
  actor: AdminActor,
): Promise<HoldScopeTemplateDTO> {
  const existing = await prisma.holdScopeTemplate.findFirst({
    where: { id: input.templateId, organizationId: actor.organizationId },
  });
  if (!existing) throw new Error(`Template ${input.templateId} not found`);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined)
    data.description = input.description?.trim() || null;
  if (input.scopeMarkdown !== undefined)
    data.scopeMarkdown = input.scopeMarkdown;
  if (input.defaultJurisdictions !== undefined)
    data.defaultJurisdictions = input.defaultJurisdictions;

  const updated = await prisma.holdScopeTemplate.update({
    where: { id: input.templateId },
    data,
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "matter.legal_hold.scope_template.updated",
    resourceType: "HoldScopeTemplate",
    resourceId: updated.id,
    beforeJson: {
      name: existing.name,
      defaultJurisdictions: [...existing.defaultJurisdictions],
    },
    afterJson: {
      name: updated.name,
      defaultJurisdictions: [...updated.defaultJurisdictions],
    },
  });

  return toDTO(updated);
}

export async function deleteHoldScopeTemplateService(
  organizationId: string,
  templateId: string,
  actor: AdminActor,
): Promise<void> {
  const existing = await prisma.holdScopeTemplate.findFirst({
    where: { id: templateId, organizationId },
  });
  if (!existing) throw new Error(`Template ${templateId} not found`);

  await prisma.holdScopeTemplate.delete({ where: { id: templateId } });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "matter.legal_hold.scope_template.deleted",
    resourceType: "HoldScopeTemplate",
    resourceId: templateId,
    beforeJson: {
      name: existing.name,
      defaultJurisdictions: [...existing.defaultJurisdictions],
    },
  });
}
