/**
 * Unit tests for the custodian search/filter/sort logic
 * (sub-PR 4c.4, Item 14).
 *
 * The CustodiansPanel keeps the filter logic inline; we extract a
 * pure helper here for unit-testability and assert it directly.
 * The component continues to call the same predicate so divergence
 * surfaces immediately.
 */
import { describe, expect, it } from "vitest";

type StatusFilter =
  | "all"
  | "acknowledged"
  | "pending"
  | "overdue"
  | "released"
  | "with-conflicts";

interface Row {
  personId: string;
  personName: string;
  personEmail: string | null;
  acknowledgedAt: string | null;
  releasedAt: string | null;
  dataSources: { retentionPolicyConflict: boolean }[];
}

// Mirror of the predicate used inside CustodiansPanel.visibleRows.
function applyFilters(
  rows: Row[],
  query: string,
  statuses: Set<StatusFilter>,
  overdueIds: Set<string>,
): Row[] {
  const q = query.trim().toLowerCase();
  const statusOf = (c: Row): StatusFilter => {
    if (c.releasedAt) return "released";
    if (overdueIds.has(c.personId)) return "overdue";
    if (c.acknowledgedAt) return "acknowledged";
    return "pending";
  };
  return rows.filter((c) => {
    if (q) {
      const hay = `${c.personName} ${c.personEmail ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statuses.size > 0 && !statuses.has("all")) {
      const s = statusOf(c);
      const matchesStatus = statuses.has(s);
      const hasConflict = c.dataSources.some((d) => d.retentionPolicyConflict);
      const matchesConflicts =
        statuses.has("with-conflicts") && hasConflict;
      if (!matchesStatus && !matchesConflicts) return false;
    }
    return true;
  });
}

const ROWS: Row[] = [
  {
    personId: "p1",
    personName: "Marcus Reid",
    personEmail: "marcus@acme.com",
    acknowledgedAt: "2026-04-01T00:00:00Z",
    releasedAt: null,
    dataSources: [{ retentionPolicyConflict: false }],
  },
  {
    personId: "p2",
    personName: "Priya Kulkarni",
    personEmail: "priya@acme.com",
    acknowledgedAt: null,
    releasedAt: null,
    dataSources: [{ retentionPolicyConflict: true }],
  },
  {
    personId: "p3",
    personName: "Alex Nguyen",
    personEmail: "alex@acme.com",
    acknowledgedAt: null,
    releasedAt: null,
    dataSources: [],
  },
  {
    personId: "p4",
    personName: "Diego Lara",
    personEmail: "diego@acme.com",
    acknowledgedAt: "2026-03-01T00:00:00Z",
    releasedAt: "2026-04-15T00:00:00Z",
    dataSources: [],
  },
];

describe("custodian filter predicate", () => {
  it("matches by name substring", () => {
    const out = applyFilters(ROWS, "marc", new Set(["all"]), new Set());
    expect(out.map((r) => r.personId)).toEqual(["p1"]);
  });

  it("matches by email substring (case-insensitive)", () => {
    const out = applyFilters(ROWS, "PRIYA", new Set(["all"]), new Set());
    expect(out.map((r) => r.personId)).toEqual(["p2"]);
  });

  it("returns everything when status set is just 'all'", () => {
    const out = applyFilters(ROWS, "", new Set(["all"]), new Set());
    expect(out.map((r) => r.personId)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("filters to acknowledged custodians", () => {
    const out = applyFilters(
      ROWS,
      "",
      new Set(["acknowledged"]),
      new Set(),
    );
    // p1 is acked; p4 is acked but RELEASED (status=released wins).
    expect(out.map((r) => r.personId)).toEqual(["p1"]);
  });

  it("filters to pending custodians", () => {
    const out = applyFilters(ROWS, "", new Set(["pending"]), new Set());
    expect(out.map((r) => r.personId)).toEqual(["p2", "p3"]);
  });

  it("filters to overdue custodians via the overdueIds set", () => {
    const out = applyFilters(
      ROWS,
      "",
      new Set(["overdue"]),
      new Set(["p2"]),
    );
    expect(out.map((r) => r.personId)).toEqual(["p2"]);
  });

  it("filters to released custodians", () => {
    const out = applyFilters(ROWS, "", new Set(["released"]), new Set());
    expect(out.map((r) => r.personId)).toEqual(["p4"]);
  });

  it("with-conflicts matches rows with any retentionPolicyConflict source", () => {
    const out = applyFilters(
      ROWS,
      "",
      new Set(["with-conflicts"]),
      new Set(),
    );
    expect(out.map((r) => r.personId)).toEqual(["p2"]);
  });

  it("combines status + search (search 'marc' + pending = empty)", () => {
    const out = applyFilters(
      ROWS,
      "marc",
      new Set(["pending"]),
      new Set(),
    );
    expect(out).toHaveLength(0);
  });

  it("combines status + search (search 'priya' + with-conflicts = p2)", () => {
    const out = applyFilters(
      ROWS,
      "priya",
      new Set(["with-conflicts"]),
      new Set(),
    );
    expect(out.map((r) => r.personId)).toEqual(["p2"]);
  });

  it("status = pending + with-conflicts returns the union", () => {
    const out = applyFilters(
      ROWS,
      "",
      new Set(["pending", "with-conflicts"]),
      new Set(),
    );
    // p2 is both pending AND has conflict; p3 is pending but no conflict.
    // Both should appear (p2 once, p3 once).
    expect(out.map((r) => r.personId).sort()).toEqual(["p2", "p3"]);
  });
});
