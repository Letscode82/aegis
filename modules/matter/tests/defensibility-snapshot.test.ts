/**
 * Unit tests for defensibility snapshot logic (sub-PR 4c.5, Item 15).
 *
 * The DB-touching paths require Postgres + the chain trigger.
 * Here we cover the pure ISO-week bucketing helper that drives
 * retention thinning, and the prune algorithm via mocked prisma.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    holdDefensibilityScoreSnapshot: {
      findMany: findManyMock,
      deleteMany: deleteManyMock,
    },
  },
}));

vi.mock(
  "../src/internal/legal-hold/services/defensibility",
  () => ({
    getHoldDefensibilityScoreService: vi.fn(),
  }),
);

const { isoWeek, pruneOldSnapshotsService } = await import(
  "../src/internal/legal-hold/services/defensibility-snapshot"
);

beforeEach(() => {
  findManyMock.mockReset();
  deleteManyMock.mockReset();
});

describe("isoWeek()", () => {
  it("groups consecutive days within the same week", () => {
    expect(isoWeek(new Date("2026-05-04T00:00:00Z"))).toBe(
      isoWeek(new Date("2026-05-08T23:00:00Z")),
    );
  });

  it("rolls forward to the next week on Monday", () => {
    const sun = isoWeek(new Date("2026-05-10T00:00:00Z"));
    const mon = isoWeek(new Date("2026-05-11T00:00:00Z"));
    expect(sun).not.toEqual(mon);
  });

  it("formats as YYYY-Www with zero-padded week", () => {
    const k = isoWeek(new Date("2026-01-05T00:00:00Z"));
    expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("pruneOldSnapshotsService", () => {
  it("returns deletedCount=0 when nothing is older than 90 days", async () => {
    findManyMock.mockResolvedValueOnce([]);
    const result = await pruneOldSnapshotsService("org1");
    expect(result).toEqual({ deletedCount: 0 });
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("keeps the latest snapshot per (hold, ISO week) and deletes the rest", async () => {
    // Three snapshots in the same week for hold "h1": prune should
    // keep the latest, delete the other two.
    findManyMock.mockResolvedValueOnce([
      { id: "a", legalHoldId: "h1", computedAt: new Date("2025-01-06T00:00:00Z") },
      { id: "b", legalHoldId: "h1", computedAt: new Date("2025-01-07T00:00:00Z") },
      { id: "c", legalHoldId: "h1", computedAt: new Date("2025-01-08T00:00:00Z") },
    ]);
    deleteManyMock.mockResolvedValueOnce({ count: 2 });
    const result = await pruneOldSnapshotsService("org1");
    expect(result.deletedCount).toBe(2);
    const deletedIds = deleteManyMock.mock.calls[0]?.[0]?.where?.id?.in;
    expect(new Set(deletedIds)).toEqual(new Set(["a", "b"]));
  });

  it("preserves boundaries between holds (no cross-hold thinning)", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "h1-a", legalHoldId: "h1", computedAt: new Date("2025-01-06T00:00:00Z") },
      { id: "h2-a", legalHoldId: "h2", computedAt: new Date("2025-01-06T00:00:00Z") },
    ]);
    const result = await pruneOldSnapshotsService("org1");
    // Each hold's single snapshot is kept (they're in different
    // (holdId, week) buckets — no winner-takes-all across holds).
    expect(result.deletedCount).toBe(0);
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("keeps every week's representative across multiple weeks", async () => {
    // 14 days starting Wed 2025-01-01 spans 3 ISO weeks; prune
    // keeps one per week = 3 keepers, 11 deletes.
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date("2025-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      rows.push({
        id: `r-${i}`,
        legalHoldId: "h1",
        computedAt: d,
      });
    }
    findManyMock.mockResolvedValueOnce(rows);
    const result = await pruneOldSnapshotsService("org1");
    expect(result.deletedCount).toBe(11);
  });
});
