import { describe, it, expect } from "vitest";
import {
  SKILL_ACTIONS,
  validateSkillInput,
  orgSkillToCatalog,
  mergeSkills,
} from "../lib/one-legal/skills-merge.mjs";

// SK-7 — pure helpers for admin-editable ONE Legal skills. Org-authored rows
// (the `Skill` table) fold over the built-in catalog at read time. These tests
// lock the validate/merge/map behaviour the store + API routes depend on.

describe("SKILL_ACTIONS", () => {
  it("is the route/research/prefill union", () => {
    expect(SKILL_ACTIONS).toEqual(["route", "research", "prefill"]);
  });
});

describe("validateSkillInput", () => {
  it("accepts a full, valid payload and cleans it", () => {
    const { ok, errors, value } = validateSkillInput({
      slug: "Whistleblower-Policy",
      label: "  Whistleblower policy  ",
      prompt: " Draft a whistleblower policy for: ",
      category: "Compliance & Frameworks",
      action: "prefill",
      description: "A speak-up policy draft.",
      cats: ["Policy", " ", 3, "Governance "],
      featured: true,
      enabled: false,
    });
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    const v = value as unknown as Record<string, unknown>;
    expect(v.slug).toBe("whistleblower-policy");
    expect(v.label).toBe("Whistleblower policy");
    expect(v.prompt).toBe("Draft a whistleblower policy for:");
    expect(v.action).toBe("prefill");
    expect(v.cats).toEqual(["Policy", "Governance"]);
    expect(v.featured).toBe(true);
    expect(v.enabled).toBe(false);
    expect(v.icon).toBe("✦");
  });

  it("rejects a bad slug, missing fields, bad action", () => {
    const { ok, errors, value } = validateSkillInput({
      slug: "Bad Slug!",
      label: "",
      prompt: "",
      category: "",
      action: "mutate",
    });
    expect(ok).toBe(false);
    expect(value).toBeNull();
    expect(errors.some((e: string) => e.includes("slug"))).toBe(true);
    expect(errors.some((e: string) => e.includes("label"))).toBe(true);
    expect(errors.some((e: string) => e.includes("prompt"))).toBe(true);
    expect(errors.some((e: string) => e.includes("category"))).toBe(true);
    expect(errors.some((e: string) => e.includes("action"))).toBe(true);
  });

  it("partial mode only checks supplied fields", () => {
    const { ok, value } = validateSkillInput({ label: "New label" }, { partial: true });
    expect(ok).toBe(true);
    const v = value as unknown as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["label"]);
    expect(v.label).toBe("New label");
  });

  it("partial mode still rejects a supplied bad field", () => {
    const { ok, errors } = validateSkillInput({ action: "nope" }, { partial: true });
    expect(ok).toBe(false);
    expect(errors.some((e: string) => e.includes("action"))).toBe(true);
  });

  it("defaults enabled to true when absent (create)", () => {
    const { ok, value } = validateSkillInput({
      slug: "x-skill",
      label: "X",
      prompt: "do x",
      category: "Cat",
      action: "route",
    });
    expect(ok).toBe(true);
    expect((value as unknown as Record<string, unknown>).enabled).toBe(true);
  });
});

describe("orgSkillToCatalog", () => {
  it("maps a row to the catalog shape", () => {
    const c = orgSkillToCatalog({
      slug: "my-skill",
      label: "My skill",
      description: "desc here",
      icon: "★",
      action: "research",
      prompt: "research this",
      cats: ["A", "B"],
      category: "Legal Research",
      featured: true,
      reviewSkillId: "contract-review",
    }) as unknown as Record<string, unknown>;
    expect(c.id).toBe("my-skill");
    expect(c.label).toBe("My skill");
    expect(c.desc).toBe("desc here");
    expect(c.icon).toBe("★");
    expect(c.action).toBe("research");
    expect(c.prompt).toBe("research this");
    expect(c.cats).toEqual(["A", "B"]);
    expect(c.category).toBe("Legal Research");
    expect(c.featured).toBe(true);
    expect(c.reviewSkillId).toBe("contract-review");
    expect(c._source).toBe("org");
  });

  it("defaults icon and omits reviewSkillId when absent", () => {
    const c = orgSkillToCatalog({ slug: "s", label: "S", description: null, action: "route", prompt: "p", cats: null, category: "C" }) as unknown as Record<string, unknown>;
    expect(c.icon).toBe("✦");
    expect(c.desc).toBe("");
    expect(c.cats).toEqual([]);
    expect("reviewSkillId" in c).toBe(false);
  });
});

describe("mergeSkills", () => {
  const STATICS = [
    { id: "nda-draft", label: "NDA auto-draft", desc: "...", icon: "✎", action: "route", prompt: "Draft NDA", cats: ["NDA"], category: "Contracts & Commercial", featured: true },
    { id: "dsar", label: "File a DSAR", desc: "...", icon: "◷", action: "route", prompt: "File DSAR", cats: ["Privacy"], category: "Privacy & Data Protection" },
  ];

  it("passes built-ins through unchanged when no org rows", () => {
    expect(mergeSkills(STATICS, [])).toEqual(STATICS);
  });

  it("overrides a built-in in place when slug matches id", () => {
    const out: Array<Record<string, unknown>> = mergeSkills(STATICS, [
      { slug: "nda-draft", label: "NDA (custom)", description: "ours", icon: "✎", action: "route", prompt: "Draft our NDA", cats: ["NDA"], category: "Contracts & Commercial", featured: false, enabled: true },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]!.id).toBe("nda-draft");
    expect(out[0]!.label).toBe("NDA (custom)");
    expect(out[0]!._source).toBe("override");
    expect(out[1]!.id).toBe("dsar");
  });

  it("hides a built-in when the override row is disabled", () => {
    const out: Array<Record<string, unknown>> = mergeSkills(STATICS, [
      { slug: "dsar", label: "x", description: "x", action: "route", prompt: "x", category: "x", enabled: false },
    ]);
    expect(out.length).toBe(1);
    expect(out[0]!.id).toBe("nda-draft");
  });

  it("appends a net-new org skill after the built-ins", () => {
    const out: Array<Record<string, unknown>> = mergeSkills(STATICS, [
      { slug: "whistleblower", label: "Whistleblower", description: "policy", icon: "✦", action: "prefill", prompt: "Draft WB policy: ", cats: [], category: "Compliance & Frameworks", enabled: true },
    ]);
    expect(out.length).toBe(3);
    expect(out[2]!.id).toBe("whistleblower");
    expect(out[2]!._source).toBe("org");
  });

  it("drops a disabled net-new org skill", () => {
    const out: Array<Record<string, unknown>> = mergeSkills(STATICS, [
      { slug: "hidden", label: "H", description: "h", action: "route", prompt: "h", category: "C", enabled: false },
    ]);
    expect(out.length).toBe(2);
  });

  it("tolerates null/garbage inputs", () => {
    expect(mergeSkills(null, null)).toEqual([]);
    expect(mergeSkills(undefined, [{ nope: 1 }])).toEqual([]);
  });
});
