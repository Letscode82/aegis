/**
 * W3-4 (conflict check, issue #116) — one-brain lookup + audit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const counterpartyFindFirstMock = vi.fn();
const personFindFirstMock = vi.fn();
const ticketPartyFindManyMock = vi.fn();
const ticketFindManyMock = vi.fn();
const matterFindManyMock = vi.fn();
const matterPartyFindManyMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    counterparty: { findFirst: counterpartyFindFirstMock },
    person: { findFirst: personFindFirstMock },
    intakeTicketParty: { findMany: ticketPartyFindManyMock },
    intakeTicket: { findMany: ticketFindManyMock },
    matter: { findMany: matterFindManyMock },
    matterParty: { findMany: matterPartyFindManyMock },
  },
  logAudit: logAuditMock,
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u-alex", name: "Alex" }),
}));

const { runConflictCheck, ConflictEntityNotFoundError } = await import(
  "../src/conflict/server"
);

const TICKET = {
  id: "REQ-1",
  type: "NDA Request",
  status: "IN_REVIEW",
  priority: "High",
  submittedAt: new Date("2026-06-01T00:00:00Z"),
  description: "Mutual NDA with Acme Robotics",
};

beforeEach(() => {
  counterpartyFindFirstMock.mockReset();
  personFindFirstMock.mockReset();
  ticketPartyFindManyMock.mockReset().mockResolvedValue([]);
  ticketFindManyMock.mockReset().mockResolvedValue([]);
  matterFindManyMock.mockReset().mockResolvedValue([]);
  matterPartyFindManyMock.mockReset().mockResolvedValue([]);
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("runConflictCheck — counterparty", () => {
  it("finds tickets via parties and matters via the counterparty FK, deduped", async () => {
    counterpartyFindFirstMock.mockResolvedValue({ id: "cp-acme", name: "Acme Robotics" });
    ticketPartyFindManyMock.mockResolvedValue([
      { role: "adverse_party", ticket: TICKET },
      { role: "third_party", ticket: TICKET }, // same ticket twice → dedupe
    ]);
    matterFindManyMock.mockResolvedValue([
      { id: "m-1", matterNumber: "M-2026-0001", title: "Acme dispute", type: "LITIGATION", status: "ACTIVE" },
    ]);

    const r = await runConflictCheck("org1", { counterpartyId: "cp-acme" });
    expect(r.entity).toEqual({ kind: "counterparty", id: "cp-acme", name: "Acme Robotics" });
    expect(r.tickets).toHaveLength(1);
    expect(r.tickets[0]).toMatchObject({ id: "REQ-1", via: "adverse_party" });
    expect(r.matters).toHaveLength(1);
    expect(r.matters[0]).toMatchObject({ matterNumber: "M-2026-0001", via: "counterparty" });
  });

  it("writes the chain-sealed check audit row with hit counts", async () => {
    counterpartyFindFirstMock.mockResolvedValue({ id: "cp-acme", name: "Acme Robotics" });
    await runConflictCheck("org1", { counterpartyId: "cp-acme" });
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      actorId: "u-alex",
      action: "intake.conflict_check.run",
      resourceType: "Counterparty",
      resourceId: "cp-acme",
      afterJson: { entityName: "Acme Robotics", ticketHits: 0, matterHits: 0 },
    });
  });

  it("throws for an unknown entity", async () => {
    counterpartyFindFirstMock.mockResolvedValue(null);
    await expect(
      runConflictCheck("org1", { counterpartyId: "cp-nope" }),
    ).rejects.toBeInstanceOf(ConflictEntityNotFoundError);
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});

describe("runConflictCheck — person", () => {
  it("merges party links, requester tickets, and matter parties", async () => {
    personFindFirstMock.mockResolvedValue({ id: "p-dana", name: "Dana Lee" });
    ticketPartyFindManyMock.mockResolvedValue([
      { role: "witness", ticket: TICKET },
    ]);
    ticketFindManyMock.mockResolvedValue([
      { ...TICKET, id: "REQ-2", description: "Filed by Dana", submittedAt: new Date("2026-06-10T00:00:00Z") },
      TICKET, // also a requester on the witness ticket → dedupe keeps party link
    ]);
    matterPartyFindManyMock.mockResolvedValue([
      { role: "CUSTODIAN", matter: { id: "m-2", matterNumber: "M-2026-0002", title: "Snowflake", type: "LITIGATION", status: "ACTIVE" } },
    ]);

    const r = await runConflictCheck("org1", { personId: "p-dana" });
    expect(r.tickets).toHaveLength(2);
    // Newest first; the deduped REQ-1 keeps its party-role attribution.
    expect(r.tickets[0]).toMatchObject({ id: "REQ-2", via: "requester" });
    expect(r.tickets[1]).toMatchObject({ id: "REQ-1", via: "witness" });
    expect(r.matters[0]).toMatchObject({ id: "m-2", via: "CUSTODIAN" });
  });
});
