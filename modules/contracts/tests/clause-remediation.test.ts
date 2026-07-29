import { describe, it, expect } from "vitest";
import { buildRemediationPrompt } from "../src/internal/clause-remediation";

describe("buildRemediationPrompt", () => {
  const clause = { type: "LIABILITY_CAP", text: "Liability shall be UNLIMITED and uncapped.", risk: "HIGH" };

  it("includes the clause, playbook standard/fallback/guidance, and precedent, and asks for strict JSON", () => {
    const p = buildRemediationPrompt(
      clause,
      { standardText: "Cap at 12 months' fees.", fallbackText: "Cap at 24 months' fees.", guidance: "Never accept uncapped." },
      ["Aggregate liability capped at fees paid in the prior 12 months."],
    );
    expect(p).toContain("liability cap"); // type, humanized
    expect(p).toContain("UNLIMITED and uncapped"); // current text
    expect(p).toContain("Cap at 12 months' fees."); // standard
    expect(p).toContain("Cap at 24 months' fees."); // fallback
    expect(p).toContain("Never accept uncapped."); // guidance
    expect(p).toContain("prior 12 months"); // precedent
    expect(p).toContain("STRICT JSON");
  });

  it("degrades gracefully when there is no playbook or precedent", () => {
    const p = buildRemediationPrompt(clause, null, []);
    expect(p).toContain("No playbook standard on file.");
    expect(p).toContain("No agreeable precedent found.");
    // no empty fallback/guidance lines leak through (filtered)
    expect(p).not.toContain('""');
  });
});
