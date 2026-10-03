/**
 * AI clause redline — the diff assembly and degraded behaviour are deterministic
 * and driven by an injected runner, so these tests never touch the network or
 * the database (no contractId → no audit, no clauseType → no clause-library read).
 */
import { describe, expect, it } from "vitest";
import {
  redlineClause,
  RedlineValidationError,
  type RedlineRunner,
} from "../src/internal/redline";

const ACTOR = { id: "u-1", type: "USER" as const };

describe("redlineClause", () => {
  it("rewrites the clause and returns word-level track-changes segments", async () => {
    const runner: RedlineRunner = async () => ({
      revised: "The term of this Agreement shall be one (1) year from the Effective Date.",
      rationale: "Shortened the term to one year per our standard.",
    });
    const res = await redlineClause(
      "org-1",
      {
        original: "The term of this Agreement shall be three (3) years from the Effective Date.",
        instruction: "Shorten the term to one year.",
      },
      ACTOR,
      runner,
    );

    expect(res.degraded).toBe(false);
    expect(res.revised).toContain("one (1) year");
    expect(res.rationale).toContain("one year");
    // The diff isolates the change: "three (3) years" deleted, "one (1) year" inserted.
    const inserted = res.segments.filter((s) => s.type === "insert").map((s) => s.text).join("");
    const deleted = res.segments.filter((s) => s.type === "delete").map((s) => s.text).join("");
    expect(inserted).toContain("one");
    expect(deleted).toContain("three");
    expect(res.segments.some((s) => s.type === "equal")).toBe(true);
    expect(res.stats.added).toBeGreaterThan(0);
    expect(res.stats.removed).toBeGreaterThan(0);
  });

  it("degrades to a no-op redline when the runner returns nothing usable", async () => {
    const runner: RedlineRunner = async () => ({ revised: "", rationale: "" });
    const res = await redlineClause(
      "org-1",
      { original: "Payment is due within 30 days.", instruction: "Change to 45 days." },
      ACTOR,
      runner,
    );
    expect(res.degraded).toBe(true);
    expect(res.revised).toBe("Payment is due within 30 days.");
    expect(res.stats).toEqual({ added: 0, removed: 0 });
    expect(res.segments.every((s) => s.type === "equal")).toBe(true);
  });

  it("degrades (does not throw) when the runner throws", async () => {
    const runner: RedlineRunner = async () => {
      throw new Error("model offline");
    };
    const res = await redlineClause(
      "org-1",
      { original: "Governing law is Delaware.", instruction: "Switch to New York." },
      ACTOR,
      runner,
    );
    expect(res.degraded).toBe(true);
    expect(res.revised).toBe("Governing law is Delaware.");
  });

  it("validates required inputs", async () => {
    await expect(
      redlineClause("org-1", { original: "", instruction: "x" }, ACTOR, async () => ({})),
    ).rejects.toBeInstanceOf(RedlineValidationError);
    await expect(
      redlineClause("org-1", { original: "x", instruction: "   " }, ACTOR, async () => ({})),
    ).rejects.toBeInstanceOf(RedlineValidationError);
  });
});
