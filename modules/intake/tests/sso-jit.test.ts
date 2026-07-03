/**
 * W4-7 (Entra SSO, issue #124) — JIT provisioning + domain gating.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const userFindFirstMock = vi.fn();
const userCreateMock = vi.fn();
const personCreateMock = vi.fn();
const orgFindFirstMock = vi.fn();
const roleFindFirstMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    user: { findFirst: userFindFirstMock, create: userCreateMock },
    person: { create: personCreateMock },
    organization: { findFirst: orgFindFirstMock },
    role: { findFirst: roleFindFirstMock },
  },
  logAudit: logAuditMock,
}));

const { isJitEligible, jitProvisionUser } = await import("@aegis/auth/server");

const ROLE_ROW = {
  id: "role-req",
  name: "requester",
  permissions: ["intake:create_ticket", "intake:read_own_tickets"],
};

beforeEach(() => {
  userFindFirstMock.mockReset();
  userCreateMock.mockReset();
  personCreateMock.mockReset().mockResolvedValue({ id: "p-new" });
  orgFindFirstMock.mockReset().mockResolvedValue({ id: "org1" });
  roleFindFirstMock.mockReset().mockResolvedValue({ id: "role-req" });
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("isJitEligible — pure domain gate", () => {
  it("matches allowlisted domains case-insensitively, with @ and spaces tolerated", () => {
    expect(isJitEligible("priya@drreddys.com", "drreddys.com")).toBe(true);
    expect(isJitEligible("priya@DRREDDYS.COM", " @drreddys.com , other.example ")).toBe(true);
    expect(isJitEligible("priya@other.example", "drreddys.com,other.example")).toBe(true);
  });

  it("refuses everything when unset, and non-listed domains always", () => {
    expect(isJitEligible("priya@drreddys.com", undefined)).toBe(false);
    expect(isJitEligible("priya@drreddys.com", "")).toBe(false);
    expect(isJitEligible("priya@evil.example", "drreddys.com")).toBe(false);
    // Subdomain / suffix tricks don't pass an exact-domain list.
    expect(isJitEligible("x@notdrreddys.com", "drreddys.com")).toBe(false);
    expect(isJitEligible("x@drreddys.com.evil.example", "drreddys.com")).toBe(false);
    expect(isJitEligible("no-at-sign", "drreddys.com")).toBe(false);
  });
});

describe("jitProvisionUser", () => {
  it("creates User (requester role) + linked Person + chain-sealed audit", async () => {
    const createdUser = {
      id: "u-new",
      organizationId: "org1",
      email: "priya@drreddys.com",
      name: "Priya",
      roleId: "role-req",
      suspendedAt: null,
    };
    userCreateMock.mockResolvedValue(createdUser);
    // resolveByEmail re-read after provisioning:
    userFindFirstMock.mockResolvedValue({
      ...createdUser,
      role: ROLE_ROW,
      organization: { id: "org1", name: "Demo Org" },
    });

    const auth = await jitProvisionUser("priya@drreddys.com", "Priya Sharma");
    expect(userCreateMock.mock.calls[0][0].data).toMatchObject({
      organizationId: "org1",
      email: "priya@drreddys.com",
      name: "Priya Sharma",
      roleId: "role-req",
    });
    expect(personCreateMock.mock.calls[0][0].data).toMatchObject({
      organizationId: "org1",
      type: "EMPLOYEE",
      email: "priya@drreddys.com",
      userId: "u-new",
    });
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      organizationId: "org1",
      actorId: "u-new",
      action: "auth.user.jit_provisioned",
      resourceType: "User",
      resourceId: "u-new",
      afterJson: expect.objectContaining({ role: "requester" }),
    });
    expect(auth).not.toBeNull();
    expect(auth!.email).toBe("priya@drreddys.com");
  });

  it("refuses when the requester role isn't seeded (no half-provisioning)", async () => {
    roleFindFirstMock.mockResolvedValue(null);
    const auth = await jitProvisionUser("priya@drreddys.com");
    expect(auth).toBeNull();
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(personCreateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("derives a display name from the email local-part when none given", async () => {
    userCreateMock.mockResolvedValue({ id: "u-new" });
    userFindFirstMock.mockResolvedValue(null); // re-read shape irrelevant here
    await jitProvisionUser("dana.lee@drreddys.com");
    expect(userCreateMock.mock.calls[0][0].data.name).toBe("dana.lee");
  });
});
