// SK-7 — unit tests for the pure skills-merge helpers.
// Run with: node --test apps/web/lib/one-legal/skills-merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_ACTIONS,
  validateSkillInput,
  orgSkillToCatalog,
  mergeSkills,
} from "./skills-merge.mjs";

test("SKILL_ACTIONS is the route/research/prefill union", () => {
  assert.deepEqual(SKILL_ACTIONS, ["route", "research", "prefill"]);
});

test("validateSkillInput accepts a full, valid payload and cleans it", () => {
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
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
  assert.equal(value.slug, "whistleblower-policy"); // lowercased
  assert.equal(value.label, "Whistleblower policy"); // trimmed
  assert.equal(value.prompt, "Draft a whistleblower policy for:"); // trimmed
  assert.equal(value.action, "prefill");
  assert.deepEqual(value.cats, ["Policy", "Governance"]); // non-strings/blank dropped
  assert.equal(value.featured, true);
  assert.equal(value.enabled, false);
  assert.equal(value.icon, "✦"); // default
});

test("validateSkillInput rejects a bad slug, missing fields, bad action", () => {
  const { ok, errors, value } = validateSkillInput({
    slug: "Bad Slug!",
    label: "",
    prompt: "",
    category: "",
    action: "mutate",
  });
  assert.equal(ok, false);
  assert.equal(value, null);
  assert.ok(errors.some((e) => e.includes("slug")));
  assert.ok(errors.some((e) => e.includes("label")));
  assert.ok(errors.some((e) => e.includes("prompt")));
  assert.ok(errors.some((e) => e.includes("category")));
  assert.ok(errors.some((e) => e.includes("action")));
});

test("validateSkillInput partial mode only checks supplied fields", () => {
  const { ok, value } = validateSkillInput({ label: "New label" }, { partial: true });
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(value), ["label"]);
  assert.equal(value.label, "New label");
});

test("validateSkillInput partial mode still rejects a supplied bad field", () => {
  const { ok, errors } = validateSkillInput({ action: "nope" }, { partial: true });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("action")));
});

test("validateSkillInput defaults enabled to true when absent (create)", () => {
  const { ok, value } = validateSkillInput({
    slug: "x-skill",
    label: "X",
    prompt: "do x",
    category: "Cat",
    action: "route",
  });
  assert.equal(ok, true);
  assert.equal(value.enabled, true);
});

test("orgSkillToCatalog maps a row to the catalog shape", () => {
  const row = {
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
  };
  const c = orgSkillToCatalog(row);
  assert.equal(c.id, "my-skill");
  assert.equal(c.label, "My skill");
  assert.equal(c.desc, "desc here"); // description → desc
  assert.equal(c.icon, "★");
  assert.equal(c.action, "research");
  assert.equal(c.prompt, "research this");
  assert.deepEqual(c.cats, ["A", "B"]);
  assert.equal(c.category, "Legal Research");
  assert.equal(c.featured, true);
  assert.equal(c.reviewSkillId, "contract-review");
  assert.equal(c._source, "org");
});

test("orgSkillToCatalog defaults icon and omits reviewSkillId when absent", () => {
  const c = orgSkillToCatalog({ slug: "s", label: "S", description: null, action: "route", prompt: "p", cats: null, category: "C" });
  assert.equal(c.icon, "✦");
  assert.equal(c.desc, "");
  assert.deepEqual(c.cats, []);
  assert.ok(!("reviewSkillId" in c));
});

const STATICS = [
  { id: "nda-draft", label: "NDA auto-draft", desc: "...", icon: "✎", action: "route", prompt: "Draft NDA", cats: ["NDA"], category: "Contracts & Commercial", featured: true },
  { id: "dsar", label: "File a DSAR", desc: "...", icon: "◷", action: "route", prompt: "File DSAR", cats: ["Privacy"], category: "Privacy & Data Protection" },
];

test("mergeSkills passes built-ins through unchanged when no org rows", () => {
  const out = mergeSkills(STATICS, []);
  assert.deepEqual(out, STATICS);
});

test("mergeSkills overrides a built-in in place when slug matches id", () => {
  const out = mergeSkills(STATICS, [
    { slug: "nda-draft", label: "NDA (custom)", description: "ours", icon: "✎", action: "route", prompt: "Draft our NDA", cats: ["NDA"], category: "Contracts & Commercial", featured: false, enabled: true },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "nda-draft"); // same position
  assert.equal(out[0].label, "NDA (custom)");
  assert.equal(out[0]._source, "override");
  assert.equal(out[1].id, "dsar"); // untouched
});

test("mergeSkills with enabled:false hides a built-in", () => {
  const out = mergeSkills(STATICS, [
    { slug: "dsar", label: "x", description: "x", action: "route", prompt: "x", category: "x", enabled: false },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "nda-draft");
});

test("mergeSkills appends a net-new org skill after the built-ins", () => {
  const out = mergeSkills(STATICS, [
    { slug: "whistleblower", label: "Whistleblower", description: "policy", icon: "✦", action: "prefill", prompt: "Draft WB policy: ", cats: [], category: "Compliance & Frameworks", enabled: true },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[2].id, "whistleblower");
  assert.equal(out[2]._source, "org");
});

test("mergeSkills drops a disabled net-new org skill", () => {
  const out = mergeSkills(STATICS, [
    { slug: "hidden", label: "H", description: "h", action: "route", prompt: "h", category: "C", enabled: false },
  ]);
  assert.equal(out.length, 2);
});

test("mergeSkills tolerates null/garbage inputs", () => {
  assert.deepEqual(mergeSkills(null, null), []);
  assert.deepEqual(mergeSkills(undefined, [{ nope: 1 }]), []);
});
