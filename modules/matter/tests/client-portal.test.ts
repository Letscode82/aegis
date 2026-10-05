/**
 * Unit tests for the C-10 client-portal service.
 *
 * Covers mint (supersede-then-create + audit), resolve (happy / expired /
 * revoked / unknown / lazy-expire), revoke (active / non-active / missing),
 * and recipient listing (matter-count rollup + active-token join).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const personFindFirstMock = vi.fn();
const personFindUniqueMock = vi.fn();
const personFindManyMock = vi.fn();
const orgFindUniqueMock = vi.fn();
const tokenFindUniqueMock = vi.fn();
const tokenFindFirstMock = vi.fn();
const tokenFindManyMock = vi.fn();
const tokenCreateMock = vi.fn();
const tokenUpdateMock = vi.fn();
const tokenUpdateManyMock = vi.fn();
const partyFindManyMock = vi.fn();
const taskGroupByMock = vi.fn();
const holdGroupByMock = vi.fn();
const logAuditMock = vi.fn();

const txMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    clientPortalToken: {
      updateMany: tokenUpdateManyMock,
      create: tokenCreateMock,
    },
  }),
);

vi.mock("@aegis/db", () => ({
  prisma: {
    person: {
      findFirst: personFindFirstMock,
      findUnique: personFindUniqueMock,
      findMany: personFindManyMock,
    },
    organization: { findUnique: orgFindUniqueMock },
    clientPortalToken: {
      findUnique: tokenFindUniqueMock,
      findFirst: tokenFindFirstMock,
      findMany: tokenFindManyMock,
      update: tokenUpdateMock,
    },
    matterParty: { findMany: partyFindManyMock },
    matterTask: { groupBy: taskGroupByMock },
    legalHold: { groupBy: holdGroupByMock },
    $transaction: txMock,
  },
  logAudit: logAuditMock,
  sha256Hex: (raw: string) => createHash("sha256").update(raw).digest("hex"),
}));

const {
  mintClientPortalTokenService,
  resolveClientPortalService,
  revokeClientPortalTokenService,
  listClientPortalRecipientsService,
  ClientPortalPersonNotFoundError,
  ClientPortalTokenNotFoundError,
} = await import("../src/internal/services/client-portal");

const ACTOR = { id: "u1", organizationId: "org1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mintClientPortalTokenService", () => {
  it("throws when the person is not in the org", async () => {
    personFindFirstMock.mockResolvedValueOnce(null);
    await expect(
      mintClientPortalTokenService("org1", "pX", {}, ACTOR),
    ).rejects.toBeInstanceOf(ClientPortalPersonNotFoundError);
  });

  it("supersedes existing ACTIVE tokens then creates a new one, and audits", async () => {
    personFindFirstMock.mockResolvedValueOnce({ id: "p1", name: "Dana Client" });
    tokenCreateMock.mockResolvedValueOnce({ id: "tok1" });

    const result = await mintClientPortalTokenService(
      "org1",
      "p1",
      { label: "  Dana  " },
      ACTOR,
    );

    // revoke-existing ran before create, both inside the transaction
    expect(tokenUpdateManyMock).toHaveBeenCalledWith({
      where: { organizationId: "org1", personId: "p1", status: "ACTIVE" },
      data: { status: "REVOKED" },
    });
    const createArgs = tokenCreateMock.mock.calls[0][0];
    expect(createArgs.data.organizationId).toBe("org1");
    expect(createArgs.data.personId).toBe("p1");
    expect(createArgs.data.label).toBe("Dana"); // trimmed
    expect(createArgs.data.createdById).toBe("u1");
    expect(typeof createArgs.data.tokenHash).toBe("string");

    // raw token returned once; hash is what gets stored
    expect(result.rawToken).toBeTruthy();
    expect(createArgs.data.tokenHash).toBe(
      createHash("sha256").update(result.rawToken).digest("hex"),
    );
    expect(result.id).toBe("tok1");
    expect(result.url).toContain("/client-portal/");
    expect(result.url).toContain(result.rawToken);

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "matter.portal.invited", actorId: "u1", actorType: "USER" }),
    );
  });

  it("honours a custom expiry (days) over the 30-day default", async () => {
    personFindFirstMock.mockResolvedValueOnce({ id: "p1", name: "Dana" });
    tokenCreateMock.mockResolvedValueOnce({ id: "tok1" });
    const before = Date.now();
    const result = await mintClientPortalTokenService("org1", "p1", { expiresInDays: 7 }, ACTOR);
    const ms = new Date(result.expiresAt).getTime() - before;
    // ~7 days, allow slack
    expect(ms).toBeGreaterThan(6.9 * 86_400_000);
    expect(ms).toBeLessThan(7.1 * 86_400_000);
  });
});

describe("resolveClientPortalService", () => {
  it("returns null for an empty or unknown token", async () => {
    expect(await resolveClientPortalService("")).toBeNull();
    tokenFindUniqueMock.mockResolvedValueOnce(null);
    expect(await resolveClientPortalService("nope")).toBeNull();
  });

  it("returns null and lazily EXPIRES an ACTIVE token past its expiry", async () => {
    tokenFindUniqueMock.mockResolvedValueOnce({
      id: "tok1",
      organizationId: "org1",
      personId: "p1",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 1000),
      viewedAt: null,
    });
    const res = await resolveClientPortalService("raw");
    expect(res).toBeNull();
    expect(tokenUpdateMock).toHaveBeenCalledWith({
      where: { id: "tok1" },
      data: { status: "EXPIRED" },
    });
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("returns null for a REVOKED token without touching the row", async () => {
    tokenFindUniqueMock.mockResolvedValueOnce({
      id: "tok1",
      organizationId: "org1",
      personId: "p1",
      status: "REVOKED",
      expiresAt: new Date(Date.now() + 86_400_000),
      viewedAt: null,
    });
    expect(await resolveClientPortalService("raw")).toBeNull();
    expect(tokenUpdateMock).not.toHaveBeenCalled();
  });

  it("resolves a valid token to a scoped matter view with task/hold counts", async () => {
    tokenFindUniqueMock.mockResolvedValueOnce({
      id: "tok1",
      organizationId: "org1",
      personId: "p1",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000),
      viewedAt: null,
    });
    orgFindUniqueMock.mockResolvedValueOnce({ name: "Acme Legal" });
    personFindUniqueMock.mockResolvedValueOnce({ name: "Dana Client" });
    partyFindManyMock.mockResolvedValueOnce([
      { role: "CLIENT", matter: { id: "m1", number: "M-2026-0001", title: "Acme v Globex", type: "LITIGATION", status: "ACTIVE" } },
      { role: "CLIENT_CONTACT", matter: { id: "m1", number: "M-2026-0001", title: "Acme v Globex", type: "LITIGATION", status: "ACTIVE" } }, // dup matter
      { role: "CLIENT", matter: { id: "m2", number: null, title: "NDA review", type: "CONTRACT", status: "OPEN" } },
    ]);
    taskGroupByMock.mockResolvedValueOnce([{ matterId: "m1", _count: { _all: 3 } }]);
    holdGroupByMock.mockResolvedValueOnce([{ matterId: "m1", _count: { _all: 1 } }]);

    const view = await resolveClientPortalService("raw");
    expect(view).not.toBeNull();
    expect(view!.organizationName).toBe("Acme Legal");
    expect(view!.personName).toBe("Dana Client");
    // deduped to 2 matters
    expect(view!.matters).toHaveLength(2);
    const m1 = view!.matters.find((m) => m.id === "m1")!;
    expect(m1.openTasks).toBe(3);
    expect(m1.activeHolds).toBe(1);
    const m2 = view!.matters.find((m) => m.id === "m2")!;
    expect(m2.openTasks).toBe(0);
    expect(m2.activeHolds).toBe(0);

    // first view stamps viewedAt + lastViewedAt and writes a SYSTEM audit row
    expect(tokenUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tok1" } }),
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "matter.portal.viewed", actorType: "SYSTEM" }),
    );
  });

  it("does not re-audit on a repeat view (viewedAt already set)", async () => {
    tokenFindUniqueMock.mockResolvedValueOnce({
      id: "tok1",
      organizationId: "org1",
      personId: "p1",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000),
      viewedAt: new Date(Date.now() - 10_000),
    });
    orgFindUniqueMock.mockResolvedValueOnce({ name: "Acme" });
    personFindUniqueMock.mockResolvedValueOnce({ name: "Dana" });
    partyFindManyMock.mockResolvedValueOnce([]);
    const view = await resolveClientPortalService("raw");
    expect(view!.matters).toHaveLength(0);
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});

describe("revokeClientPortalTokenService", () => {
  it("throws when the token is missing", async () => {
    tokenFindFirstMock.mockResolvedValueOnce(null);
    await expect(
      revokeClientPortalTokenService("org1", "tokX", ACTOR),
    ).rejects.toBeInstanceOf(ClientPortalTokenNotFoundError);
  });

  it("is a no-op for a non-ACTIVE token", async () => {
    tokenFindFirstMock.mockResolvedValueOnce({ id: "tok1", personId: "p1", status: "REVOKED" });
    await revokeClientPortalTokenService("org1", "tok1", ACTOR);
    expect(tokenUpdateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("revokes an ACTIVE token and audits", async () => {
    tokenFindFirstMock.mockResolvedValueOnce({ id: "tok1", personId: "p1", status: "ACTIVE" });
    await revokeClientPortalTokenService("org1", "tok1", ACTOR);
    expect(tokenUpdateMock).toHaveBeenCalledWith({
      where: { id: "tok1" },
      data: { status: "REVOKED" },
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "matter.portal.revoked", actorType: "USER" }),
    );
  });
});

describe("listClientPortalRecipientsService", () => {
  it("returns [] when there are no matter parties", async () => {
    partyFindManyMock.mockResolvedValueOnce([]);
    expect(await listClientPortalRecipientsService("org1")).toEqual([]);
  });

  it("rolls up matter counts and joins the active token, sorted by count desc", async () => {
    partyFindManyMock.mockResolvedValueOnce([
      { personId: "p1", matterId: "m1" },
      { personId: "p1", matterId: "m2" },
      { personId: "p1", matterId: "m2" }, // dup matter for same person
      { personId: "p2", matterId: "m1" },
    ]);
    personFindManyMock.mockResolvedValueOnce([
      { id: "p1", name: "Zed", email: "zed@x.com" },
      { id: "p2", name: "Amy", email: null },
    ]);
    tokenFindManyMock.mockResolvedValueOnce([
      { id: "tok1", personId: "p1", status: "ACTIVE", expiresAt: new Date("2026-12-01T00:00:00Z"), lastViewedAt: null },
    ]);

    const list = await listClientPortalRecipientsService("org1");
    expect(list).toHaveLength(2);
    // p1 has 2 distinct matters → first
    expect(list[0].personId).toBe("p1");
    expect(list[0].matterCount).toBe(2);
    expect(list[0].token?.id).toBe("tok1");
    expect(list[1].personId).toBe("p2");
    expect(list[1].matterCount).toBe(1);
    expect(list[1].token).toBeNull();
  });
});
