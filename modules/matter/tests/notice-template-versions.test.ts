/**
 * Unit tests for the notice-template-versions service
 * (sub-PR 4c.5, Item 17).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();
const countMock = vi.fn();
const findManyMock = vi.fn();
const versionCreateMock = vi.fn();
const tplUpdateMock = vi.fn();
const txMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    holdNoticeTemplateVersion: { create: versionCreateMock },
    holdNoticeTemplate: { update: tplUpdateMock },
  }),
);
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    holdNoticeTemplate: { findFirst: findFirstMock },
    holdNoticeTemplateVersion: {
      count: countMock,
      findMany: findManyMock,
    },
    $transaction: txMock,
  },
  logAudit: logAuditMock,
  bodyHash: (s: string) => `hash-of-${s.length}`,
}));

const {
  saveTemplateVersionService,
  listTemplateVersionsService,
} = await import(
  "../src/internal/legal-hold/services/notice-template-versions"
);

const ACTOR = { id: "u1", organizationId: "org1" };

beforeEach(() => {
  findFirstMock.mockReset();
  countMock.mockReset();
  findManyMock.mockReset();
  versionCreateMock.mockReset();
  tplUpdateMock.mockReset();
  logAuditMock.mockReset();
});

describe("saveTemplateVersionService", () => {
  it("rejects empty body", async () => {
    await expect(
      saveTemplateVersionService(
        { templateId: "t1", bodyMarkdown: "" },
        ACTOR,
      ),
    ).rejects.toThrow(/bodyMarkdown required/);
  });

  it("rejects unknown templateId", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(
      saveTemplateVersionService(
        { templateId: "missing", bodyMarkdown: "x" },
        ACTOR,
      ),
    ).rejects.toThrow(/Template missing not found/);
  });

  it("first save: bootstraps v1 from current body, then writes v2", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "t1",
      organizationId: "org1",
      version: 1,
      bodyMarkdown: "OLD",
      bodyHash: "old-hash",
    });
    countMock.mockResolvedValueOnce(0);
    versionCreateMock
      .mockResolvedValueOnce({
        id: "vbootstrap",
        version: 1,
        bodyMarkdown: "OLD",
        bodyHash: "old-hash",
        changeLog: "Initial version (auto-snapshotted on first save)",
        createdById: "u1",
        createdAt: new Date(),
        createdBy: { name: "Me" },
      })
      .mockResolvedValueOnce({
        id: "vnew",
        version: 2,
        bodyMarkdown: "NEW",
        bodyHash: "hash-of-3",
        changeLog: null,
        createdById: "u1",
        createdAt: new Date(),
        createdBy: { name: "Me" },
      });
    tplUpdateMock.mockResolvedValueOnce({});

    const result = await saveTemplateVersionService(
      { templateId: "t1", bodyMarkdown: "NEW" },
      ACTOR,
    );

    expect(versionCreateMock).toHaveBeenCalledTimes(2);
    expect(versionCreateMock.mock.calls[0]?.[0]?.data).toMatchObject({
      version: 1,
      bodyMarkdown: "OLD",
      changeLog: "Initial version (auto-snapshotted on first save)",
    });
    expect(versionCreateMock.mock.calls[1]?.[0]?.data).toMatchObject({
      version: 2,
      bodyMarkdown: "NEW",
    });
    expect(tplUpdateMock).toHaveBeenCalledTimes(1);
    expect(tplUpdateMock.mock.calls[0]?.[0]?.data).toMatchObject({
      version: 2,
      bodyHash: "hash-of-3",
    });
    expect(result.templateVersion).toBe(2);
  });

  it("subsequent save: bumps version monotonically without bootstrap", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "t1",
      organizationId: "org1",
      version: 5,
      bodyMarkdown: "v5 body",
      bodyHash: "h5",
    });
    countMock.mockResolvedValueOnce(5);
    versionCreateMock.mockResolvedValueOnce({
      id: "vnew",
      version: 6,
      bodyMarkdown: "v6 body",
      bodyHash: "hash-of-7",
      changeLog: "tweaks",
      createdById: "u1",
      createdAt: new Date(),
      createdBy: { name: "Me" },
    });
    tplUpdateMock.mockResolvedValueOnce({});
    const result = await saveTemplateVersionService(
      { templateId: "t1", bodyMarkdown: "v6 body", changeLog: "tweaks" },
      ACTOR,
    );
    expect(versionCreateMock).toHaveBeenCalledTimes(1);
    expect(result.templateVersion).toBe(6);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0]?.[0]).toMatchObject({
      action: "matter.legal_hold.notice_template.version_saved",
    });
  });
});

describe("listTemplateVersionsService", () => {
  it("orders newest first", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "t1" });
    findManyMock.mockResolvedValueOnce([
      {
        id: "v3",
        version: 3,
        bodyMarkdown: "x",
        bodyHash: "h",
        changeLog: null,
        createdById: "u1",
        createdAt: new Date(),
        createdBy: null,
      },
    ]);
    await listTemplateVersionsService("t1", ACTOR);
    expect(findManyMock.mock.calls[0]?.[0]?.orderBy).toEqual([
      { version: "desc" },
    ]);
  });

  it("rejects unknown templateId from another org", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(
      listTemplateVersionsService("foreign", ACTOR),
    ).rejects.toThrow(/not found/);
  });
});
