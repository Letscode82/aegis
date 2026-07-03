/** W1-3 smoke + unit: timeline panel transforms; detail extraction works. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({ prisma: {} }));

const ui = await import("../src/intake/timeline-panel.jsx" as never);
const srv = await import("../src/timeline/server" as never);

describe("W1-3 Ticket Timeline", () => {
  it("exports the panel component", () => {
    expect(typeof ui.TicketTimelinePanel).toBe("function");
  });
  it("extracts a human detail from known payload shapes", () => {
    expect(srv.extractDetail({ ruleName: "Breach escalation" }, null)).toBe("Breach escalation");
    expect(srv.extractDetail(null, { ruleName: "R1" })).toBe("R1");
    expect(srv.extractDetail({ stage: "opinion" }, null)).toBe("opinion");
    expect(srv.extractDetail(null, { reason: "capacity overflow" })).toBe("capacity overflow");
    expect(srv.extractDetail(null, null)).toBeNull();
    expect(srv.extractDetail({}, {})).toBeNull();
  });
});
