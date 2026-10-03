/**
 * Document Management System sync — reconciliation planner (C-3).
 *
 * Pure, provider-agnostic, deterministic. Given the current remote folder
 * listing and AEGIS's record of what it last synced (`SyncLink[]`), it emits
 * the actions that bring the two sides into agreement — and, critically, flags
 * the two-sided-edit case as a `conflict` rather than silently clobbering
 * either side. Applying the plan (writing `Document` rows, uploading bytes) and
 * chain-sealing each action on the audit ledger is the caller's job; this layer
 * owns only the decision, so it stays free of `@aegis/db` and is exhaustively
 * unit-tested.
 */
import type { DmsDocument } from "./types.js";

/**
 * AEGIS's memory of one previously-synced (or locally-new) document. A link
 * with an empty `externalId` is a local-only document awaiting its first push.
 */
export interface SyncLink {
  /** The AEGIS `Document.id`. */
  documentId: string;
  /** The DMS document id, or "" for a local-only document not yet pushed. */
  externalId: string;
  /** Content hash recorded at the last successful sync. */
  syncedHash?: string;
  /** `modifiedAt` recorded at the last successful sync (fallback change signal). */
  syncedModifiedAt?: string;
  /** True when the AEGIS copy changed since the last sync. */
  localDirty?: boolean;
}

/** One reconciliation step. */
export type SyncAction =
  | { type: "pull-create"; remote: DmsDocument }
  | { type: "pull-update"; remote: DmsDocument; documentId: string }
  | { type: "push-create"; documentId: string }
  | { type: "push-update"; documentId: string; externalId: string }
  | { type: "remote-deleted"; documentId: string; externalId: string }
  | { type: "conflict"; documentId: string; externalId: string; reason: ConflictReason }
  | { type: "unchanged"; externalId: string; documentId: string };

export type ConflictReason = "both-edited" | "remote-deleted-local-edited";

export interface SyncPlan {
  actions: SyncAction[];
  /** Convenience counts for the audit summary / UI badge. */
  summary: Record<SyncAction["type"], number>;
}

export interface PlanSyncInput {
  /** The current DMS folder listing. */
  remote: DmsDocument[];
  /** AEGIS's record of prior syncs for this folder (plus local-only docs). */
  links: SyncLink[];
}

/** Did the remote copy change since the last sync? Prefer hash, fall back to mtime. */
function remoteChanged(remote: DmsDocument, link: SyncLink): boolean {
  if (link.syncedHash !== undefined && remote.contentHash !== undefined) {
    return remote.contentHash !== link.syncedHash;
  }
  if (link.syncedModifiedAt !== undefined) {
    return remote.modifiedAt !== link.syncedModifiedAt;
  }
  // No recorded baseline — treat as changed so the caller re-materializes it.
  return true;
}

function emptyPlan(): SyncPlan {
  return {
    actions: [],
    summary: {
      "pull-create": 0,
      "pull-update": 0,
      "push-create": 0,
      "push-update": 0,
      "remote-deleted": 0,
      conflict: 0,
      unchanged: 0,
    },
  };
}

/**
 * Compute the reconciliation plan. Pure: same inputs → same actions, in a
 * stable order (remote-driven actions first in listing order, then local-only
 * pushes in link order).
 */
export function planSync(input: PlanSyncInput): SyncPlan {
  const plan = emptyPlan();
  const byExternalId = new Map<string, SyncLink>();
  const localOnly: SyncLink[] = [];
  for (const link of input.links) {
    if (link.externalId) byExternalId.set(link.externalId, link);
    else localOnly.push(link);
  }

  const seen = new Set<string>();

  // Remote-driven: walk the DMS listing in order.
  for (const remote of input.remote) {
    const link = byExternalId.get(remote.externalId);
    if (!link) {
      push(plan, { type: "pull-create", remote });
      continue;
    }
    seen.add(remote.externalId);
    const rChanged = remoteChanged(remote, link);
    const lChanged = !!link.localDirty;
    if (rChanged && lChanged) {
      push(plan, { type: "conflict", documentId: link.documentId, externalId: remote.externalId, reason: "both-edited" });
    } else if (rChanged) {
      push(plan, { type: "pull-update", remote, documentId: link.documentId });
    } else if (lChanged) {
      push(plan, { type: "push-update", documentId: link.documentId, externalId: remote.externalId });
    } else {
      push(plan, { type: "unchanged", externalId: remote.externalId, documentId: link.documentId });
    }
  }

  // Links that point at a remote doc no longer in the listing → remote-deleted.
  for (const link of byExternalId.values()) {
    if (seen.has(link.externalId)) continue;
    if (link.localDirty) {
      push(plan, { type: "conflict", documentId: link.documentId, externalId: link.externalId, reason: "remote-deleted-local-edited" });
    } else {
      push(plan, { type: "remote-deleted", documentId: link.documentId, externalId: link.externalId });
    }
  }

  // Local-only documents (no externalId yet) → first push.
  for (const link of localOnly) {
    push(plan, { type: "push-create", documentId: link.documentId });
  }

  return plan;
}

function push(plan: SyncPlan, action: SyncAction): void {
  plan.actions.push(action);
  plan.summary[action.type] += 1;
}

/** The action types that mutate one side or the other (i.e. not unchanged). */
export function isMutatingAction(action: SyncAction): boolean {
  return action.type !== "unchanged";
}
