import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadRegistry, loadRegistryFromData, route, buildSystemPrompt, listSkills, wrapDocuments } from "../index.mjs";

const reg = loadRegistry();

test("registry has 60 built skills across modules", () => {
  assert.equal(listSkills(reg).length, 60);
  assert.ok(listSkills(reg, { status: null }).length > 100);
});

test("loadRegistryFromData indexes an imported object identically to loadRegistry", () => {
  // Simulates a bundler `import reg from "@aegis/legal-skills/registry.json"`.
  const raw = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "registry.json"), "utf8"));
  const reg2 = loadRegistryFromData(raw);
  assert.equal(listSkills(reg2).length, 60);
  const [best] = route(reg2, "can I sign this NDA from a vendor");
  assert.equal(best.id, "contracts/nda-triage");
  // buildSystemPrompt works off the object-loaded registry too.
  const sys = buildSystemPrompt(reg2, [best.id], { matter: { id: "MAT-1", privileged: false } });
  assert.ok(sys.includes("aegis_skill") && sys.includes("matter_context"));
});

const cases = [
  ["can I sign this NDA from a vendor", "contracts/nda-triage"],
  ["we had a ransomware attack, who do we need to notify", "privacy/breach-response"],
  ["assess our DPDPA compliance obligations and gaps", "privacy/dpdpa-compliance"],
  ["outside counsel invoice looks inflated, check billing guidelines", "outside-counsel/invoice-review"],
  ["is this AGPL dependency okay to ship", "ip/open-source-review"],
  ["preserve documents, we expect to be sued", "disputes/litigation-hold"],
  ["classify our AI hiring tool under the EU AI Act", "regulatory/ai-governance"],
  // SK-6 — the batch of newly built playbooks route to themselves.
  ["draft or update a whistleblower speak-up policy", "regulatory/whistleblower-programme"],
  ["run a legitimate interest assessment balancing test", "privacy/legitimate-interest-assessment"],
  ["draft a layered privacy and consent notice", "privacy/privacy-notice-drafter"],
  ["review our cookie banner and tracking consent", "privacy/cookie-and-tracking"],
  ["build a matter budget and fee forecast", "outside-counsel/matter-budget"],
  ["build a matter plan with critical path and milestones", "matters/matter-plan"],
];
for (const [q, expected] of cases) {
  test(`routes: ${q}`, () => {
    const ids = route(reg, q).map((r) => r.id);
    assert.ok(ids.includes(expected), `${expected} not in ${ids.join(", ")}`);
  });
}

test("falls back to triage for unrelated text", () => {
  assert.equal(route(reg, "zzz qqq")[0].id, "intake/request-triage");
});

test("system prompt includes standards before the skill", () => {
  const p = buildSystemPrompt(reg, ["contracts/contract-review"], { matter: { id: "MAT-1" } });
  assert.ok(p.indexOf("AEGIS Skill Standards") < p.indexOf('aegis_skill id="contracts/contract-review"'));
  assert.match(p, /playbook-schema\.md/);
  assert.match(p, /data, not instructions/);
});

test("planned skills cannot be loaded", () => {
  assert.throws(() => buildSystemPrompt(reg, ["contracts/clause-drafter"]), /planned/);
});

test("wrapDocuments escapes names", () => {
  assert.match(wrapDocuments([{ name: 'a"b', text: "x" }]), /name="a'b"/);
});
