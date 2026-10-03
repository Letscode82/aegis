import { describe, it, expect } from "vitest";
import {
  SKILLS,
  SKILL_CATEGORIES,
  resolveSkillTarget,
  type OneLegalSkill,
  type SkillTarget,
} from "../lib/one-legal/skills";

// These tests lock in the fix for the "wrong response" bug: a skill must open
// the surface that matches what it does, and in particular a drafting skill
// (e.g. "Whistleblower policy") must NEVER be thrown through the intake triage
// classifier — which has no policy category and fell back to the Privacy / DSAR
// intake form. resolveSkillTarget is the single, deterministic source of truth.

const byId = (id: string): OneLegalSkill => {
  const s = SKILLS.find((x) => x.id === id);
  if (!s) throw new Error(`skill not found: ${id}`);
  return s;
};

describe("skills catalog integrity", () => {
  it("every skill has the required fields and a known category", () => {
    for (const s of SKILLS) {
      expect(s.id, `id on ${s.label}`).toBeTruthy();
      expect(s.label, `label on ${s.id}`).toBeTruthy();
      expect(s.prompt, `prompt on ${s.id}`).toBeTruthy();
      expect(["route", "research", "prefill"]).toContain(s.action);
      expect(SKILL_CATEGORIES, `category of ${s.id}`).toContain(s.category);
    }
  });

  it("skill ids are unique", () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolveSkillTarget returns a valid target for every skill", () => {
    const valid: SkillTarget[] = ["draft", "review", "research", "route"];
    for (const s of SKILLS) {
      expect(valid, `target of ${s.id}`).toContain(resolveSkillTarget(s));
    }
  });
});

describe("resolveSkillTarget — action semantics", () => {
  it("'route' skills route through the intent router", () => {
    for (const s of SKILLS.filter((x) => x.action === "route")) {
      expect(resolveSkillTarget(s), s.id).toBe("route");
    }
  });

  it("'research' skills open the research agent", () => {
    for (const s of SKILLS.filter((x) => x.action === "research")) {
      expect(resolveSkillTarget(s), s.id).toBe("research");
    }
  });

  it("a 'prefill' skill with no explicit run defaults to the governed playbook (never intake)", () => {
    const prefillNoRun = SKILLS.filter((x) => x.action === "prefill" && !x.run);
    expect(prefillNoRun.length).toBeGreaterThan(0);
    for (const s of prefillNoRun) {
      // The safe default — deep skill-review — files nothing and matches the
      // right playbook, so a prefill skill can never silently misfile a ticket.
      expect(resolveSkillTarget(s), s.id).toBe("review");
    }
  });
});

describe("the whistleblower-policy bug is fixed", () => {
  it("'Whistleblower policy' opens the draft canvas, not an intake form", () => {
    const wb = byId("whistleblower-policy");
    expect(wb.action).toBe("prefill");
    expect(resolveSkillTarget(wb)).toBe("draft");
    // It must not route anywhere that would re-classify it through intake triage.
    expect(resolveSkillTarget(wb)).not.toBe("route");
  });

  it("no drafting-document skill resolves to the intake router", () => {
    // Document-drafting skills — their job is to produce an editable draft.
    const draftIds = [
      "whistleblower-policy", "cookie-policy", "privacy-notice", "cpr-letter",
      "disclosure-list", "deadline-calendar", "preservation-notice",
      "board-resolution", "entity-formation", "governance-attest",
      "budget-build", "matter-scope", "matter-plan",
      "rfp-pitch", "engagement-terms", "local-counsel", "memo",
      "legal-notice", "legal-translation",
    ];
    for (const id of draftIds) {
      expect(resolveSkillTarget(byId(id)), id).toBe("draft");
    }
  });
});

describe("each skill's surface matches its intent", () => {
  // Document reviews / assessments run the governed playbook (read-only).
  it("review/assessment skills resolve to the playbook", () => {
    const reviewIds = [
      "nda-review", "contract-review", "msa-saas-review", "liability-cap",
      "dispute-clause", "tos-scan", "playbook-check", "dpa-review",
      "ai-act-classify", "framework-gap", "export-control",
      "screening-adjudication", "dismissal-screen", "settlement-review",
      "trademark-clearance", "ip-assignment", "copyright-originality",
      "invoice-review", "oc-performance",
      // SK-5 — playbook-backed drafting-ish skills run through the governed
      // playbook (they carry a reviewSkillId), not the canvas.
      "plain-language", "status-report",
    ];
    for (const id of reviewIds) {
      expect(resolveSkillTarget(byId(id)), id).toBe("review");
    }
  });

  // SK-5 — any skill backed by a built @aegis/legal-skills playbook must open the
  // governed review surface (never the intake router or the canvas).
  it("every playbook-backed skill resolves to the review surface", () => {
    const backed = SKILLS.filter((s) => s.reviewSkillId);
    expect(backed.length).toBeGreaterThan(0);
    for (const s of backed) {
      expect(resolveSkillTarget(s), s.id).toBe("review");
    }
  });

  // Intake-filing / live-query skills keep the intent router.
  it("intake-filing and live-query skills resolve to the router", () => {
    const routeIds = [
      "open-matter", "employment-intake", "custodian-manage", "ediscovery",
      "everything-about", "dsar", "sanctions-screen", "legal-hold",
      "spend-summary", "open-contracts", "holds-overview", "intake-queue",
    ];
    for (const id of routeIds) {
      expect(resolveSkillTarget(byId(id)), id).toBe("route");
    }
  });

  // Corpus research skills open the research agent.
  it("corpus research skills resolve to research", () => {
    const researchIds = ["corpus-research", "ccpa", "eu-ai-act", "dora", "nis2", "soc2", "iso27001", "hipaa", "chronology", "fdi-check"];
    for (const id of researchIds) {
      expect(resolveSkillTarget(byId(id)), id).toBe("research");
    }
  });
});
