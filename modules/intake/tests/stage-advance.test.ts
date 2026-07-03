/** W1-5 unit: stage advancement — configured + legacy sequences. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({ prisma: {}, logAudit: vi.fn(), getCurrentUser: vi.fn() }));

const { computeStageAdvance, buildConfiguredWorkflow, FinalStageError, LEGACY_STAGES } =
  await import("../src/stage/server" as never);

describe("W1-5 stage advancement", () => {
  const stages = ["intake", "search", "opinion", "filed"];

  it("advances through a configured sequence in order", () => {
    expect(computeStageAdvance("intake", stages)).toEqual({ next: "search", sequence: "configured", index: 1 });
    expect(computeStageAdvance("opinion", stages)).toEqual({ next: "filed", sequence: "configured", index: 3 });
  });

  it("a pre-sequence stage ('new') enters the configured sequence at its first stage", () => {
    expect(computeStageAdvance("new", stages).next).toBe("intake");
  });

  it("refuses to advance past the final configured stage", () => {
    expect(() => computeStageAdvance("filed", stages)).toThrow(FinalStageError);
  });

  it("falls back to the legacy sequence when no type stages exist", () => {
    expect(computeStageAdvance("new", [])).toEqual({ next: "triage", sequence: "legacy", index: 1 });
    expect(computeStageAdvance("review", [])).toEqual({ next: "complete", sequence: "legacy", index: 4 });
    expect(() => computeStageAdvance("complete", [])).toThrow(FinalStageError);
    expect(LEGACY_STAGES[0]).toBe("new");
  });

  it("builds the configured workflow with book-ends and flags", () => {
    const wf = buildConfiguredWorkflow(stages, 2) as Array<{ label: string; done?: boolean; active?: boolean }>;
    expect(wf[0]).toEqual({ label: "Submitted", done: true });
    expect(wf[1]).toEqual({ label: "intake", done: true });
    expect(wf[2]).toEqual({ label: "search", done: true });
    expect(wf[3]).toEqual({ label: "opinion", active: true });
    expect(wf[4]).toEqual({ label: "filed" });
    expect(wf[5]).toEqual({ label: "Close" });
  });
});
