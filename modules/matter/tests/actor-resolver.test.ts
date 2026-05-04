/**
 * Unit tests for the actor-resolver service (sub-PR 4c.3).
 *
 * The full `resolveActorsService` exercises the User table; here we
 * mock prisma at the module boundary so the tests run without a DB.
 * The mock is set up before importing the service under test.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    user: { findMany: findManyMock },
  },
}));

// Import AFTER vi.mock so the service picks up the mocked prisma.
const { actorKey, resolveActorsService } = await import(
  "../src/internal/legal-hold/services/actor-resolver"
);

beforeEach(() => {
  findManyMock.mockReset();
});

describe("actorKey()", () => {
  it("composes a stable key from type + id", () => {
    expect(actorKey("u1", "USER")).toBe("USER:u1");
    expect(actorKey(null, "SYSTEM")).toBe("SYSTEM:");
    expect(actorKey("agent-7", "AGENT")).toBe("AGENT:agent-7");
  });
});

describe("resolveActorsService()", () => {
  it("resolves USER actors via prisma.user.findMany", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "u1", name: "Marcus Reid", role: { name: "Admin" } },
    ]);
    const lookup = await resolveActorsService("org1", [
      { actorId: "u1", actorType: "USER" },
    ]);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(lookup.get("USER:u1")).toMatchObject({
      type: "USER",
      displayName: "Marcus Reid",
      roleLabel: "Admin",
      unknown: false,
    });
  });

  it("dedupes USER ids — one batch query for repeated actors", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "u1", name: "Marcus", role: null },
    ]);
    await resolveActorsService("org1", [
      { actorId: "u1", actorType: "USER" },
      { actorId: "u1", actorType: "USER" },
      { actorId: "u1", actorType: "USER" },
    ]);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const callArgs = findManyMock.mock.calls[0]?.[0];
    expect(callArgs.where.id.in).toEqual(["u1"]);
  });

  it("returns SYSTEM actors without hitting the DB", async () => {
    const lookup = await resolveActorsService("org1", [
      { actorId: null, actorType: "SYSTEM" },
    ]);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(lookup.get("SYSTEM:")).toMatchObject({
      type: "SYSTEM",
      displayName: "SYSTEM",
      roleLabel: null,
      unknown: false,
    });
  });

  it("returns AGENT actors with a generic label (4d will populate)", async () => {
    const lookup = await resolveActorsService("org1", [
      { actorId: "decision-1", actorType: "AGENT" },
    ]);
    expect(findManyMock).not.toHaveBeenCalled();
    expect(lookup.get("AGENT:decision-1")).toMatchObject({
      type: "AGENT",
      displayName: "AEGIS Agent",
      roleLabel: "AI",
    });
  });

  it("marks USER lookups that miss as unknown without crashing", async () => {
    findManyMock.mockResolvedValueOnce([]); // no matches
    const lookup = await resolveActorsService("org1", [
      { actorId: "u-foreign-org", actorType: "USER" },
    ]);
    expect(lookup.get("USER:u-foreign-org")).toMatchObject({
      type: "USER",
      displayName: "(unknown user)",
      unknown: true,
    });
  });

  it("scopes the user query to the caller's organizationId", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await resolveActorsService("orgA", [
      { actorId: "u1", actorType: "USER" },
    ]);
    const callArgs = findManyMock.mock.calls[0]?.[0];
    expect(callArgs.where.organizationId).toBe("orgA");
  });

  it("handles a mixed batch in one round-trip", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "u1", name: "Alice", role: { name: "GC" } },
      { id: "u2", name: "Bob", role: { name: "Paralegal" } },
    ]);
    const lookup = await resolveActorsService("org1", [
      { actorId: "u1", actorType: "USER" },
      { actorId: null, actorType: "SYSTEM" },
      { actorId: "u2", actorType: "USER" },
      { actorId: "agent-x", actorType: "AGENT" },
    ]);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(lookup.size).toBe(4);
    expect(lookup.get("USER:u1")?.displayName).toBe("Alice");
    expect(lookup.get("USER:u2")?.roleLabel).toBe("Paralegal");
    expect(lookup.get("SYSTEM:")?.displayName).toBe("SYSTEM");
    expect(lookup.get("AGENT:agent-x")?.displayName).toBe("AEGIS Agent");
  });
});
