/**
 * Saved views (sub-PR 4c.5, Item 16).
 *
 * Filter + sort state persisted per scope. Owned by a specific
 * user; can be marked `isShared` to surface across the org.
 * `isDefault` makes the view auto-apply when the owner returns to
 * that scope.
 *
 * The DB layer treats `filterStateJson` as opaque — every scope's
 * UI is responsible for serialising / deserialising. Don't query
 * inside.
 */
import { logAudit, prisma, type SavedViewScope } from "@aegis/db";

export interface SavedViewDTO {
  id: string;
  scope: SavedViewScope;
  name: string;
  filterState: unknown;
  isShared: boolean;
  isDefault: boolean;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActorLite {
  id: string;
  organizationId: string;
}

/**
 * List views visible to the actor for one scope: every view the
 * actor owns, plus every shared view across the org.
 *
 * Sort: actor's own views first, then shared views, both sorted
 * alphabetically. Defaults bubble to the top within each section.
 */
export async function listSavedViewsService(
  actor: ActorLite,
  scope: SavedViewScope,
): Promise<SavedViewDTO[]> {
  const rows = await prisma.savedView.findMany({
    where: {
      organizationId: actor.organizationId,
      scope,
      OR: [{ ownerId: actor.id }, { isShared: true }],
    },
    include: { owner: { select: { name: true } } },
    orderBy: [
      { isDefault: "desc" },
      { name: "asc" },
    ],
  });
  // Re-sort: own views first, then shared.
  const own = rows.filter((r) => r.ownerId === actor.id);
  const shared = rows.filter((r) => r.ownerId !== actor.id);
  return [...own, ...shared].map(toDTO);
}

export interface CreateSavedViewInput {
  scope: SavedViewScope;
  name: string;
  filterState: unknown;
  isShared?: boolean;
  isDefault?: boolean;
}

export async function createSavedViewService(
  input: CreateSavedViewInput,
  actor: ActorLite,
): Promise<SavedViewDTO> {
  const trimmed = input.name?.trim();
  if (!trimmed) throw new Error("name required");

  const isDefault = !!input.isDefault;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      // Only one default per (owner, scope). Clear any existing.
      await tx.savedView.updateMany({
        where: {
          organizationId: actor.organizationId,
          ownerId: actor.id,
          scope: input.scope,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }
    return tx.savedView.create({
      data: {
        organizationId: actor.organizationId,
        ownerId: actor.id,
        scope: input.scope,
        name: trimmed,
        filterStateJson: (input.filterState ?? {}) as object,
        isShared: !!input.isShared,
        isDefault,
      },
      include: { owner: { select: { name: true } } },
    });
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "saved_view.created",
    resourceType: "SavedView",
    resourceId: created.id,
    afterJson: {
      scope: created.scope,
      name: created.name,
      isShared: created.isShared,
      isDefault: created.isDefault,
    },
  });

  return toDTO(created);
}

export interface UpdateSavedViewInput {
  viewId: string;
  name?: string;
  filterState?: unknown;
  isShared?: boolean;
  isDefault?: boolean;
}

export async function updateSavedViewService(
  input: UpdateSavedViewInput,
  actor: ActorLite,
): Promise<SavedViewDTO> {
  const existing = await prisma.savedView.findFirst({
    where: { id: input.viewId, organizationId: actor.organizationId },
  });
  if (!existing) throw new Error(`Saved view ${input.viewId} not found`);
  if (existing.ownerId !== actor.id) {
    throw new Error("Only the view's owner can edit it");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // If we're switching to default=true, clear any existing default
    // for the same (owner, scope) tuple.
    if (input.isDefault === true && !existing.isDefault) {
      await tx.savedView.updateMany({
        where: {
          organizationId: actor.organizationId,
          ownerId: actor.id,
          scope: existing.scope,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.filterState !== undefined)
      data.filterStateJson = input.filterState as object;
    if (input.isShared !== undefined) data.isShared = input.isShared;
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    return tx.savedView.update({
      where: { id: input.viewId },
      data,
      include: { owner: { select: { name: true } } },
    });
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "saved_view.updated",
    resourceType: "SavedView",
    resourceId: updated.id,
    beforeJson: {
      name: existing.name,
      isShared: existing.isShared,
      isDefault: existing.isDefault,
    },
    afterJson: {
      name: updated.name,
      isShared: updated.isShared,
      isDefault: updated.isDefault,
    },
  });

  return toDTO(updated);
}

export async function deleteSavedViewService(
  viewId: string,
  actor: ActorLite,
): Promise<void> {
  const existing = await prisma.savedView.findFirst({
    where: { id: viewId, organizationId: actor.organizationId },
  });
  if (!existing) throw new Error(`Saved view ${viewId} not found`);
  if (existing.ownerId !== actor.id) {
    throw new Error("Only the view's owner can delete it");
  }
  await prisma.savedView.delete({ where: { id: viewId } });
  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "saved_view.deleted",
    resourceType: "SavedView",
    resourceId: viewId,
    beforeJson: {
      scope: existing.scope,
      name: existing.name,
    },
  });
}

function toDTO(
  row: {
    id: string;
    scope: SavedViewScope;
    name: string;
    filterStateJson: unknown;
    isShared: boolean;
    isDefault: boolean;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
    owner?: { name: string } | null;
  },
): SavedViewDTO {
  return {
    id: row.id,
    scope: row.scope,
    name: row.name,
    filterState: row.filterStateJson,
    isShared: row.isShared,
    isDefault: row.isDefault,
    ownerId: row.ownerId,
    ownerName: row.owner?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
