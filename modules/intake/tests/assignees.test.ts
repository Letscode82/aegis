/**
 * P1b — assignable-user directory behind the Cockpit's reassign
 * picker and the Inbox "My Queue" filter.
 *
 * Asserts the query shape (org-scoped, active-only, legal-team roles
 * only) and the flattened DTO. Prisma is mocked at the module
 * boundary — same pattern as the other intake server tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const userFindManyMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: { user: { findMany: userFindManyMock } },
}));

const { listAssignableUsers } = await import("../src/assignees/server");

beforeEach(() => {
  userFindManyMock.mockReset();
});

describe("listAssignableUsers()", () => {
  it("scopes to the org, excludes suspended users, and restricts to legal-team roles", async () => {
    userFindManyMock.mockResolvedValue([]);
    await listAssignableUsers("org1");

    expect(userFindManyMock).toHaveBeenCalledTimes(1);
    const args = userFindManyMock.mock.calls[0][0];
    expect(args.where.organizationId).toBe("org1");
    expect(args.where.suspendedAt).toBeNull();
    expect(args.where.role.name.in).toEqual([
      "admin",
      "gc",
      "attorney",
      "paralegal",
      "legal_ops",
    ]);
    // Requesters / external counsel / viewers must never be offered
    // as assignees.
    expect(args.where.role.name.in).not.toContain("requester");
    expect(args.where.role.name.in).not.toContain("external_counsel");
    expect(args.where.role.name.in).not.toContain("viewer");
  });

  it("flattens the role relation into roleName", async () => {
    userFindManyMock.mockResolvedValue([
      {
        id: "u-lena",
        name: "Lena Pérez",
        email: "lena.attorney@aegis-demo.example",
        role: { name: "attorney" },
      },
      {
        id: "u-norole",
        name: "Edge Case",
        email: "edge@aegis-demo.example",
        role: null,
      },
    ]);
    const out = await listAssignableUsers("org1");
    expect(out).toEqual([
      {
        id: "u-lena",
        name: "Lena Pérez",
        email: "lena.attorney@aegis-demo.example",
        roleName: "attorney",
      },
      {
        id: "u-norole",
        name: "Edge Case",
        email: "edge@aegis-demo.example",
        roleName: null,
      },
    ]);
  });
});
