/**
 * Sanctions screening (Intake P2b) — real query against
 * SanctionsListEntry + comprehensive-jurisdiction programs, replacing
 * the hardcoded mockSanctionsCheck.
 *
 * The load-bearing assertion: an empty / stale list returns
 * "unavailable", NEVER a false "clear".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();
const findManyMock = vi.fn();
const upsertMock = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    sanctionsListEntry: {
      findFirst: findFirstMock,
      findMany: findManyMock,
      upsert: upsertMock,
    },
  },
}));

const {
  screenAgainstSanctions,
  refreshSanctionsList,
  normalizeName,
  STALE_AFTER_DAYS,
} = await import("../src/sanctions/server");

const NOW = Date.parse("2026-06-24T00:00:00Z");
const fresh = () => new Date(NOW - 1 * 24 * 3600 * 1000); // 1 day old

beforeEach(() => {
  findFirstMock.mockReset();
  findManyMock.mockReset().mockResolvedValue([]);
  upsertMock.mockReset().mockResolvedValue({});
});

describe("screenAgainstSanctions — jurisdiction embargo", () => {
  it("flags a comprehensively-sanctioned jurisdiction as a hit (even with empty list)", async () => {
    findFirstMock.mockResolvedValue(null); // empty list
    const r = await screenAgainstSanctions("Some Vendor", "Iran", NOW);
    expect(r.status).toBe("hit");
    expect(r.flags[0]).toMatch(/Iran/i);
  });
});

describe("screenAgainstSanctions — safe default (the critical behavior)", () => {
  it("returns UNAVAILABLE, not clear, when the list is empty", async () => {
    findFirstMock.mockResolvedValue(null);
    const r = await screenAgainstSanctions("Clean Vendor LLC", "US", NOW);
    expect(r.status).toBe("unavailable");
    expect(r.status).not.toBe("clear");
    expect(r.note).toMatch(/manual screening required|cannot be performed/i);
  });

  it("returns UNAVAILABLE when the list is stale", async () => {
    findFirstMock.mockResolvedValue({
      refreshedAt: new Date(NOW - (STALE_AFTER_DAYS + 5) * 24 * 3600 * 1000),
    });
    const r = await screenAgainstSanctions("Clean Vendor LLC", "US", NOW);
    expect(r.status).toBe("unavailable");
    expect(r.flags[0]).toMatch(/stale/i);
  });
});

describe("screenAgainstSanctions — name matching against a fresh list", () => {
  beforeEach(() => {
    findFirstMock.mockResolvedValue({ refreshedAt: fresh() });
  });

  it("returns HIT on a name match", async () => {
    findManyMock.mockResolvedValue([
      {
        entityName: "Sberbank of Russia",
        normalizedName: "sberbank of russia",
        source: "BOOTSTRAP",
        programs: ["RUSSIA-EO14024"],
      },
    ]);
    const r = await screenAgainstSanctions("Sberbank of Russia", "Russia", NOW);
    expect(r.status).toBe("hit");
    expect(r.matches[0].entityName).toMatch(/Sberbank/);
  });

  it("returns CLEAR when a fresh list has no match", async () => {
    findManyMock.mockResolvedValue([]); // no candidate rows
    const r = await screenAgainstSanctions("Acme Robotics", "US", NOW);
    expect(r.status).toBe("clear");
    expect(r.flags).toHaveLength(0);
    expect(r.listAsOf).not.toBeNull();
  });

  it("does not false-positive on a partial single-token overlap", async () => {
    // Listed entity "Global Trading Co" normalizes to "global trading";
    // a vendor "Global Solutions" shares only "global" → no match.
    findManyMock.mockResolvedValue([
      { entityName: "Global Trading Co", normalizedName: "global trading", source: "OFAC-SDN", programs: [] },
    ]);
    const r = await screenAgainstSanctions("Global Solutions", "US", NOW);
    expect(r.status).toBe("clear");
  });
});

describe("normalizeName", () => {
  it("lowercases, strips punctuation and common org suffixes", () => {
    expect(normalizeName("Acme Corp., Inc.")).toBe("acme");
    expect(normalizeName("VTB Bank")).toBe("vtb bank");
  });
});

describe("refreshSanctionsList", () => {
  it("upserts each entry on (source, sourceRef) and stamps refreshedAt", async () => {
    const fetcher = async () => [
      { source: "OFAC-SDN", sourceRef: "123", entityName: "Bad Actor LLC", programs: ["SDGT"], aliases: ["BadCo"], country: "XX" },
    ];
    const out = await refreshSanctionsList(fetcher, NOW);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.where.source_sourceRef).toEqual({ source: "OFAC-SDN", sourceRef: "123" });
    expect(call.create.normalizedName).toBe("bad actor"); // "llc" stripped
    expect(out[0]).toMatchObject({ source: "OFAC-SDN", upserted: 1 });
  });
});
