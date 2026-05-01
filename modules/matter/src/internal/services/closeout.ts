/**
 * Closeout checklist application + gate.
 *
 * On matter create, the relevant MatterTypeConfig.closeoutChecklist is
 * snapshotted onto Matter.closeoutChecklistJson — the matter's own
 * checklist evolves independently of the org-level template after that.
 *
 * On task complete, if the task carries a closeoutKey we tick the
 * matching checklist item.
 *
 * On matter close, every `required` checklist item must be `completed`
 * or the transition is rejected.
 */
import { prisma, type MatterType } from "@aegis/db";
import type { CloseoutChecklistItem } from "../types";

interface RawChecklistItem {
  key: string;
  label: string;
  required?: boolean;
  completed?: boolean;
  completedAt?: string;
  completedBy?: string;
}

function normalize(items: unknown): CloseoutChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it): it is RawChecklistItem => {
      if (!it || typeof it !== "object") return false;
      const o = it as Record<string, unknown>;
      return typeof o.key === "string" && typeof o.label === "string";
    })
    .map((it) => ({
      key: it.key,
      label: it.label,
      required: it.required ?? false,
      completed: it.completed ?? false,
      completedAt: it.completedAt,
      completedBy: it.completedBy,
    }));
}

/** Snapshot the org-level template into the matter's own checklist on creation. */
export async function checklistFromTypeConfig(
  organizationId: string,
  matterType: MatterType,
): Promise<CloseoutChecklistItem[]> {
  const config = await prisma.matterTypeConfig.findUnique({
    where: { organizationId_matterType: { organizationId, matterType } },
    select: { closeoutChecklist: true },
  });
  return normalize(config?.closeoutChecklist);
}

/** Returns updated checklist with the matching key marked complete. No-op if key missing. */
export function markCompleted(
  items: CloseoutChecklistItem[],
  key: string,
  by: string,
): CloseoutChecklistItem[] {
  const now = new Date().toISOString();
  return items.map((it) =>
    it.key === key
      ? { ...it, completed: true, completedAt: now, completedBy: by }
      : it,
  );
}

export class CloseoutChecklistIncompleteError extends Error {
  public readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Cannot close matter — required checklist items incomplete: ${missing.join(", ")}`,
    );
    this.name = "CloseoutChecklistIncompleteError";
    this.missing = missing;
  }
}

/** Assert every `required` item is `completed`. Throws if any are missing. */
export function assertCloseoutComplete(
  items: CloseoutChecklistItem[],
): void {
  const missing = items
    .filter((it) => it.required && !it.completed)
    .map((it) => it.key);
  if (missing.length > 0) {
    throw new CloseoutChecklistIncompleteError(missing);
  }
}

export function readChecklist(value: unknown): CloseoutChecklistItem[] {
  return normalize(value);
}
