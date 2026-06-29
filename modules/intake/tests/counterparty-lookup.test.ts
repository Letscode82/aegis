/**
 * NDA agent counterparty lookup (Intake P2b) — real query against the
 * shared Counterparty entity, replacing the hardcoded mockPriorNDACheck.
 *
 * Honest by construction: reports the actual relationship (exists +
 * matter count), never a fabricated "active NDA on file".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const matterFindManyMock = vi.fn();
const documentFindFirstMock = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    counterparty: { findMany: findManyMock },
    matter: { findMany: matterFindManyMock },
    document: { findFirst: documentFindFirstMock },
  },
}));

const { lookupCounterpartyRelationship } = await import(
  "../src/counterparty/server"
);

beforeEach(() => {
  findManyMock.mockReset();
  matterFindManyMock.mockReset().mockResolvedValue([]);
  documentFindFirstMock.mockReset().mockResolvedValue(null);
});

describe("lookupCounterpartyRelationship()", () => {
  it("returns not-found for an empty / too-short name without querying", async () => {
    const r = await lookupCounterpartyRelationship("org1", "");
    expect(r.found).toBe(false);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("finds an existing counterparty and reports prior matter count", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "cp-acme",
        name: "Acme Corp",
        type: "COMPANY",
        country: "US",
        _count: { matters: 2 },
      },
    ]);
    const r = await lookupCounterpartyRelationship("org1", "Acme Corp");
    expect(r.found).toBe(true);
    expect(r.counterpartyId).toBe("cp-acme");
    expect(r.priorMatterCount).toBe(2);
    expect(r.note).toMatch(/existing counterparty/i);
    expect(r.note).toMatch(/2 matters/);
    // Scoped + case-insensitive query.
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org1");
    expect(where.name.mode).toBe("insensitive");
  });

  it("does NOT fabricate an NDA — only reports the relationship", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "cp-x", name: "Globex", type: "COMPANY", country: "US", _count: { matters: 0 } },
    ]);
    const r = await lookupCounterpartyRelationship("org1", "Globex");
    expect(r.found).toBe(true);
    // No ndaId / "active NDA on file" — the old mock's fiction is gone.
    expect(r).not.toHaveProperty("ndaId");
    expect(r.note).not.toMatch(/active.*NDA on file/i);
    expect(r.note).toMatch(/no prior matters|drafting new/i);
  });

  it("detects a REAL prior NDA document via the counterparty's matters", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "cp-snowflake", name: "Snowflake Inc.", type: "COMPANY", country: "US", _count: { matters: 1 } },
    ]);
    matterFindManyMock.mockResolvedValue([{ id: "m-snowflake-msa" }]);
    documentFindFirstMock.mockResolvedValue({
      id: "doc-nda-snowflake",
      name: "Mutual NDA — Snowflake Inc. (executed)",
      uploadedAt: new Date("2026-02-14T00:00:00Z"),
    });
    const r = await lookupCounterpartyRelationship("org1", "Snowflake Inc.");
    expect(r.found).toBe(true);
    expect(r.priorNda).toEqual({
      documentId: "doc-nda-snowflake",
      name: "Mutual NDA — Snowflake Inc. (executed)",
      uploadedAt: "2026-02-14T00:00:00.000Z",
    });
    // Now it's safe to recommend reuse — a real document backs it.
    expect(r.note).toMatch(/existing NDA on file/i);
    expect(r.note).toMatch(/reus/i);
    // The document query was scoped to the counterparty's matters.
    const docWhere = documentFindFirstMock.mock.calls[0][0].where;
    expect(docWhere.ownerType).toBe("MATTER");
    expect(docWhere.ownerId.in).toEqual(["m-snowflake-msa"]);
  });

  it("falls back to a first-token match for a near-miss legal name", async () => {
    // Exact contains misses, loose first-token ("Acme") hits.
    findManyMock
      .mockResolvedValueOnce([]) // "Acme Robotics" contains → none
      .mockResolvedValueOnce([
        { id: "cp-acme", name: "Acme Corp", type: "COMPANY", country: "US", _count: { matters: 1 } },
      ]);
    const r = await lookupCounterpartyRelationship("org1", "Acme Robotics");
    expect(r.found).toBe(true);
    expect(r.counterpartyName).toBe("Acme Corp");
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });

  it("returns not-found when nothing matches", async () => {
    findManyMock.mockResolvedValue([]); // both passes empty
    const r = await lookupCounterpartyRelationship("org1", "Nonexistent Partners");
    expect(r.found).toBe(false);
    expect(r.note).toMatch(/no existing relationship/i);
  });
});
