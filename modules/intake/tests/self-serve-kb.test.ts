/**
 * Self-Service KB (Intake P4a) — the Self-Service tab now derives from
 * the SAME AGENT_KB the FAQ agent answers from, instead of a separate
 * 6-entry list with fabricated resolution / deflection stats.
 */
import { describe, expect, it } from "vitest";
import { AGENT_KB } from "../src/agents/kb";
import {
  SELF_SERVE_ARTICLES,
  SELF_SERVE_CATEGORIES,
  selfServeCategory,
} from "../src/intake-kb";

describe("Self-Service KB derivation", () => {
  it("derives one article per AGENT_KB entry (one source of truth)", () => {
    expect(SELF_SERVE_ARTICLES.length).toBe(AGENT_KB.length);
    expect(SELF_SERVE_ARTICLES.length).toBeGreaterThanOrEqual(25);
  });

  it("carries only fields we can stand behind — no fabricated stats", () => {
    for (const a of SELF_SERVE_ARTICLES) {
      expect(a).toHaveProperty("q");
      expect(a).toHaveProperty("answer");
      expect(a).toHaveProperty("cat");
      expect(a).toHaveProperty("source");
      // The old fabricated fields are gone.
      expect(a).not.toHaveProperty("resolved");
      expect(a).not.toHaveProperty("deflectionRate");
    }
  });

  it("maps sources to sensible categories", () => {
    expect(selfServeCategory("Contract Playbook § 4.1")).toBe("Contract Terms");
    expect(selfServeCategory("IP Playbook § 1.1")).toBe("IP & Open Source");
    expect(selfServeCategory("Privacy Playbook § 2.1")).toBe("Privacy & Data");
    expect(selfServeCategory("Privacy Notice § 7")).toBe("Privacy & Data");
    expect(selfServeCategory("Vendor Playbook § 3.4")).toBe("Vendor & Procurement");
    expect(selfServeCategory("Sanctions Screen")).toBe("Compliance");
    expect(selfServeCategory("Trade Compliance § 2")).toBe("Compliance");
    expect(selfServeCategory("Brand & Legal Policy § 3")).toBe("Brand & Publicity");
    expect(selfServeCategory("Intake Playbook § 1.4")).toBe("Process");
    expect(selfServeCategory("Something Unknown")).toBe("General");
  });

  it("exposes a non-trivial set of distinct categories", () => {
    expect(SELF_SERVE_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    // No duplicates.
    expect(new Set(SELF_SERVE_CATEGORIES).size).toBe(SELF_SERVE_CATEGORIES.length);
    // Every article's category is in the category list.
    for (const a of SELF_SERVE_ARTICLES) {
      expect(SELF_SERVE_CATEGORIES).toContain(a.cat);
    }
  });
});
