/**
 * Unit tests for saved-views service (sub-PR 4c.5, Item 16).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const updateManyMock = vi.fn();
const deleteMock = vi.fn();
const txMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    savedView: {
      create: createMock,
      update: updateMock,
      updateMany: updateManyMock,
      delete: deleteMock,
    },
  }),
);
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    savedView: {
      findMany: findManyMock,
      findFirst: findFirstMock,
      delete: deleteMock,
    },
    $transaction: txMock,
  },
  logAudit: logAuditMock,
}));

const {
  createSavedViewService,
  deleteSavedViewService,
  listSavedViewsService,
  updateSavedViewService,
} = await import("../src/internal/legal-hold/services/saved-views");

const ACTOR = { id: "u1", organizationId: "org1" };

beforeEach(() => {
  findManyMock.mockReset();
  findFirstMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
  updateManyMock.mockReset();
  deleteMock.mockReset();
  logAuditMock.mockReset();
});

describe("listSavedViewsService", () => {
  it("queries scoped by org + scope + (own OR shared)", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await listSavedViewsService(ACTOR, "LEGAL_HOLD_CUSTODIANS");
    const where = findManyMock.mock.calls[0]?.[0]?.where;
    expect(where.organizationId).toBe("org1");
    expect(where.scope).toBe("LEGAL_HOLD_CUSTODIANS");
    expect(where.OR).toEqual([
      { ownerId: "u1" },
      { isShared: true },
    ]);
  });

  it("orders own views before shared views", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "v1",
        ownerId: "u1",
        scope: "LEGAL_HOLD_CUSTODIANS",
        name: "B-mine",
        filterStateJson: {},
        isShared: false,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { name: "Me" },
      },
      {
        id: "v2",
        ownerId: "u2",
        scope: "LEGAL_HOLD_CUSTODIANS",
        name: "A-shared",
        filterStateJson: {},
        isShared: true,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { name: "Bob" },
      },
    ]);
    const out = await listSavedViewsService(ACTOR, "LEGAL_HOLD_CUSTODIANS");
    expect(out.map((r) => r.id)).toEqual(["v1", "v2"]);
  });
});

describe("createSavedViewService", () => {
  it("rejects empty names", async () => {
    await expect(
      createSavedViewService(
        { scope: "LEGAL_HOLD_CUSTODIANS", name: "  ", filterState: {} },
        ACTOR,
      ),
    ).rejects.toThrow(/name required/);
  });

  it("clears existing default before creating a new default", async () => {
    createMock.mockResolvedValueOnce({
      id: "v1",
      ownerId: "u1",
      scope: "LEGAL_HOLD_CUSTODIANS",
      name: "Default",
      filterStateJson: {},
      isShared: false,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: { name: "Me" },
    });
    await createSavedViewService(
      {
        scope: "LEGAL_HOLD_CUSTODIANS",
        name: "Default",
        filterState: {},
        isDefault: true,
      },
      ACTOR,
    );
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const wm = updateManyMock.mock.calls[0]?.[0];
    expect(wm.where).toEqual({
      organizationId: "org1",
      ownerId: "u1",
      scope: "LEGAL_HOLD_CUSTODIANS",
      isDefault: true,
    });
    expect(wm.data).toEqual({ isDefault: false });
  });

  it("does not touch existing defaults when isDefault=false", async () => {
    createMock.mockResolvedValueOnce({
      id: "v1",
      ownerId: "u1",
      scope: "LEGAL_HOLD_CUSTODIANS",
      name: "Plain",
      filterStateJson: {},
      isShared: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: { name: "Me" },
    });
    await createSavedViewService(
      { scope: "LEGAL_HOLD_CUSTODIANS", name: "Plain", filterState: {} },
      ACTOR,
    );
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("writes a saved_view.created audit row", async () => {
    createMock.mockResolvedValueOnce({
      id: "v1",
      ownerId: "u1",
      scope: "LEGAL_HOLD_CUSTODIANS",
      name: "X",
      filterStateJson: {},
      isShared: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: { name: "Me" },
    });
    await createSavedViewService(
      { scope: "LEGAL_HOLD_CUSTODIANS", name: "X", filterState: {} },
      ACTOR,
    );
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0]?.[0]).toMatchObject({
      action: "saved_view.created",
      resourceType: "SavedView",
      resourceId: "v1",
    });
  });
});

describe("updateSavedViewService", () => {
  it("rejects edits from non-owners", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "v1",
      ownerId: "OTHER_USER",
      organizationId: "org1",
      scope: "LEGAL_HOLD_CUSTODIANS",
      name: "X",
      isShared: false,
      isDefault: false,
    });
    await expect(
      updateSavedViewService({ viewId: "v1", name: "Y" }, ACTOR),
    ).rejects.toThrow(/Only the view's owner can edit it/);
  });

  it("rejects unknown viewId", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(
      updateSavedViewService({ viewId: "missing", name: "Y" }, ACTOR),
    ).rejects.toThrow(/not found/);
  });
});

describe("deleteSavedViewService", () => {
  it("rejects delete from non-owners", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "v1",
      ownerId: "OTHER_USER",
      organizationId: "org1",
      scope: "LEGAL_HOLD_CUSTODIANS",
    });
    await expect(deleteSavedViewService("v1", ACTOR)).rejects.toThrow(
      /Only the view's owner can delete it/,
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
