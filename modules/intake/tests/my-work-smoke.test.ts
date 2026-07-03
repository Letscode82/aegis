/** W1-1 smoke + unit: MyWork component transforms; ranking is correct. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({ prisma: {}, IntakeStatus: { AWAITING_TRIAGE: "AWAITING_TRIAGE", IN_REVIEW: "IN_REVIEW", APPROVED: "APPROVED", REJECTED: "REJECTED", ESCALATED: "ESCALATED", CLOSED: "CLOSED" } }));

const ui = await import("../src/intake/my-work.jsx" as never);
const srv = await import("../src/my-work/server" as never);

describe("W1-1 My Work", () => {
  it("exports the tab component", () => {
    expect(typeof ui.MyWorkTab).toBe("function");
  });

  it("ranks overdue first, then priority, then oldest", () => {
    const rows = [
      { id: "c", slaStatus: "On Track", priority: "Critical", submittedAt: "2026-07-02" },
      { id: "a", slaStatus: "Overdue", priority: "Low", submittedAt: "2026-07-03" },
      { id: "b", slaStatus: "On Track", priority: "Critical", submittedAt: "2026-07-01" },
      { id: "d", slaStatus: "At Risk", priority: "Medium", submittedAt: "2026-07-01" },
    ];
    const ranked = srv.rankMyTickets(rows).map((r: { id: string }) => r.id);
    expect(ranked[0]).toBe("a");          // overdue beats everything
    expect(ranked[1]).toBe("b");          // Critical, older
    expect(ranked[2]).toBe("c");          // Critical, newer
    expect(ranked[3]).toBe("d");          // Medium
  });
});
