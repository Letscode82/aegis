import { describe, it, expect } from "vitest";
import { planSync, isMutatingAction, type SyncLink } from "../src/sync.js";
import type { DmsDocument } from "../src/types.js";

function doc(externalId: string, over: Partial<DmsDocument> = {}): DmsDocument {
  return {
    externalId,
    name: `${externalId}.pdf`,
    folderId: "f1",
    contentHash: `${externalId}-h1`,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("planSync", () => {
  it("pull-creates a remote document AEGIS has never seen", () => {
    const plan = planSync({ remote: [doc("a")], links: [] });
    expect(plan.actions).toEqual([{ type: "pull-create", remote: doc("a") }]);
    expect(plan.summary["pull-create"]).toBe(1);
  });

  it("marks an unchanged document unchanged (hash match)", () => {
    const link: SyncLink = { documentId: "D1", externalId: "a", syncedHash: "a-h1" };
    const plan = planSync({ remote: [doc("a")], links: [link] });
    expect(plan.actions).toEqual([{ type: "unchanged", externalId: "a", documentId: "D1" }]);
  });

  it("pull-updates when only the remote changed", () => {
    const link: SyncLink = { documentId: "D1", externalId: "a", syncedHash: "a-OLD" };
    const remote = doc("a", { contentHash: "a-h1" });
    const plan = planSync({ remote: [remote], links: [link] });
    expect(plan.actions).toEqual([{ type: "pull-update", remote, documentId: "D1" }]);
  });

  it("push-updates when only the local copy changed", () => {
    const link: SyncLink = { documentId: "D1", externalId: "a", syncedHash: "a-h1", localDirty: true };
    const plan = planSync({ remote: [doc("a")], links: [link] });
    expect(plan.actions).toEqual([{ type: "push-update", documentId: "D1", externalId: "a" }]);
  });

  it("flags a two-sided edit as a both-edited conflict", () => {
    const link: SyncLink = { documentId: "D1", externalId: "a", syncedHash: "a-OLD", localDirty: true };
    const plan = planSync({ remote: [doc("a", { contentHash: "a-NEW" })], links: [link] });
    expect(plan.actions).toEqual([{ type: "conflict", documentId: "D1", externalId: "a", reason: "both-edited" }]);
  });

  it("reports a remote deletion, and conflicts when the local copy was also edited", () => {
    const clean: SyncLink = { documentId: "D1", externalId: "gone", syncedHash: "x" };
    const dirty: SyncLink = { documentId: "D2", externalId: "gone2", syncedHash: "y", localDirty: true };
    const plan = planSync({ remote: [], links: [clean, dirty] });
    expect(plan.actions).toContainEqual({ type: "remote-deleted", documentId: "D1", externalId: "gone" });
    expect(plan.actions).toContainEqual({ type: "conflict", documentId: "D2", externalId: "gone2", reason: "remote-deleted-local-edited" });
  });

  it("push-creates a local-only document (no external id yet)", () => {
    const link: SyncLink = { documentId: "D9", externalId: "", localDirty: true };
    const plan = planSync({ remote: [], links: [link] });
    expect(plan.actions).toEqual([{ type: "push-create", documentId: "D9" }]);
  });

  it("falls back to modifiedAt when no hash baseline exists", () => {
    const link: SyncLink = { documentId: "D1", externalId: "a", syncedModifiedAt: "2026-01-01T00:00:00.000Z" };
    const unchanged = planSync({ remote: [doc("a", { contentHash: undefined })], links: [link] });
    expect(unchanged.actions[0]?.type).toBe("unchanged");

    const changed = planSync({ remote: [doc("a", { contentHash: undefined, modifiedAt: "2026-02-01T00:00:00.000Z" })], links: [link] });
    expect(changed.actions[0]?.type).toBe("pull-update");
  });

  it("is deterministic and keeps summary counts in sync with actions", () => {
    const remote = [doc("a"), doc("b", { contentHash: "b-NEW" }), doc("c")];
    const links: SyncLink[] = [
      { documentId: "DB", externalId: "b", syncedHash: "b-OLD" },
      { documentId: "DC", externalId: "c", syncedHash: "c-h1" },
      { documentId: "DX", externalId: "", localDirty: true },
    ];
    const first = planSync({ remote, links });
    const second = planSync({ remote, links });
    expect(first).toEqual(second);
    const mutating = first.actions.filter(isMutatingAction).length;
    expect(mutating).toBe(first.actions.length - first.summary.unchanged);
  });
});
