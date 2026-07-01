/**
 * Intake ticket parties (Phase 1 item 3) — who is involved, linked to the
 * shared Person / Counterparty entities with a role. Org-scoped + audited.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ticketFindFirst = vi.fn();
const partyFindMany = vi.fn();
const partyCreate = vi.fn();
const partyFindFirst = vi.fn();
const partyUpdate = vi.fn();
const partyDelete = vi.fn();
const personFindFirst = vi.fn();
const cpFindFirst = vi.fn();
const logAuditMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: { findFirst: ticketFindFirst },
    intakeTicketParty: { findMany: partyFindMany, create: partyCreate, findFirst: partyFindFirst, update: partyUpdate, delete: partyDelete },
    person: { findFirst: personFindFirst },
    counterparty: { findFirst: cpFindFirst },
  },
  logAudit: logAuditMock,
  getCurrentUser: getUserMock,
}));

const {
  listParties,
  addParty,
  updateParty,
  removeParty,
  TicketNotFoundError,
  PartyNotFoundError,
  PartyValidationError,
} = await import("../src/parties/server");

beforeEach(() => {
  ticketFindFirst.mockReset().mockResolvedValue({ id: "REQ-1" });
  partyFindMany.mockReset().mockResolvedValue([]);
  partyCreate.mockReset();
  partyFindFirst.mockReset();
  partyUpdate.mockReset();
  partyDelete.mockReset().mockResolvedValue({});
  personFindFirst.mockReset().mockResolvedValue({ id: "p-9" });
  cpFindFirst.mockReset().mockResolvedValue({ id: "cp-acme" });
  logAuditMock.mockReset().mockResolvedValue("a1");
  getUserMock.mockReset().mockResolvedValue({ id: "u-admin" });
});

describe("ticket parties", () => {
  it("404s when the ticket is not in the org", async () => {
    ticketFindFirst.mockResolvedValue(null);
    await expect(listParties("org1", "nope")).rejects.toBeInstanceOf(TicketNotFoundError);
  });

  it("adds a Person party (adverse counsel) and audits", async () => {
    partyCreate.mockResolvedValue({
      id: "pt-1", personId: "p-9", counterpartyId: null, role: "our_counsel", note: null,
      createdAt: new Date("2026-07-01T00:00:00Z"), person: { name: "Lena Perez" }, counterparty: null,
    });
    const dto = await addParty("org1", "REQ-1", { personId: "p-9", role: "our_counsel" });
    expect(dto.kind).toBe("person");
    expect(dto.name).toBe("Lena Perez");
    expect(dto.role).toBe("our_counsel");
    expect(personFindFirst.mock.calls[0][0].where.organizationId).toBe("org1");
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.party_added");
  });

  it("adds a Counterparty party (adverse party)", async () => {
    partyCreate.mockResolvedValue({
      id: "pt-2", personId: null, counterpartyId: "cp-acme", role: "adverse_party", note: null,
      createdAt: new Date("2026-07-01T00:00:00Z"), person: null, counterparty: { name: "Acme Corp" },
    });
    const dto = await addParty("org1", "REQ-1", { counterpartyId: "cp-acme", role: "adverse_party" });
    expect(dto.kind).toBe("counterparty");
    expect(dto.name).toBe("Acme Corp");
  });

  it("requires exactly one of personId / counterpartyId", async () => {
    await expect(addParty("org1", "REQ-1", {})).rejects.toBeInstanceOf(PartyValidationError);
    await expect(addParty("org1", "REQ-1", { personId: "p-9", counterpartyId: "cp-acme" })).rejects.toBeInstanceOf(PartyValidationError);
    expect(partyCreate).not.toHaveBeenCalled();
  });

  it("rejects a referenced entity outside the org", async () => {
    personFindFirst.mockResolvedValue(null);
    await expect(addParty("org1", "REQ-1", { personId: "p-x", role: "witness" })).rejects.toThrow(/not found in this organization/i);
  });

  it("updates a party role scoped to the org and audits", async () => {
    partyFindFirst.mockResolvedValue({ id: "pt-1", ticketId: "REQ-1", role: "third_party" });
    partyUpdate.mockResolvedValue({
      id: "pt-1", personId: "p-9", counterpartyId: null, role: "witness", note: null,
      createdAt: new Date("2026-07-01T00:00:00Z"), person: { name: "Lena Perez" }, counterparty: null,
    });
    const dto = await updateParty("org1", "pt-1", { role: "witness" });
    expect(dto.role).toBe("witness");
    expect(partyFindFirst.mock.calls[0][0].where.ticket.organizationId).toBe("org1");
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.party_updated");
  });

  it("404s updating a party outside the org", async () => {
    partyFindFirst.mockResolvedValue(null);
    await expect(updateParty("org1", "missing", { role: "witness" })).rejects.toBeInstanceOf(PartyNotFoundError);
  });

  it("removes a party and audits", async () => {
    partyFindFirst.mockResolvedValue({ id: "pt-1", ticketId: "REQ-1", personId: "p-9", counterpartyId: null, role: "witness" });
    await removeParty("org1", "pt-1");
    expect(partyDelete).toHaveBeenCalledWith({ where: { id: "pt-1" } });
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.party_removed");
  });

  it("lists parties with resolved entity names", async () => {
    partyFindMany.mockResolvedValue([
      { id: "pt-1", personId: "p-9", counterpartyId: null, role: "our_counsel", note: null, createdAt: new Date("2026-07-01T00:00:00Z"), person: { name: "Lena Perez" }, counterparty: null },
      { id: "pt-2", personId: null, counterpartyId: "cp-acme", role: "adverse_party", note: null, createdAt: new Date("2026-07-01T00:00:00Z"), person: null, counterparty: { name: "Acme Corp" } },
    ]);
    const list = await listParties("org1", "REQ-1");
    expect(list.map((p) => p.name)).toEqual(["Lena Perez", "Acme Corp"]);
    expect(list.map((p) => p.kind)).toEqual(["person", "counterparty"]);
  });
});
