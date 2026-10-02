import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, route, buildSystemPrompt, listSkills, wrapDocuments } from "../index.mjs";

const reg = loadRegistry();

test("registry has 30 built skills across modules", () => {
  assert.equal(listSkills(reg).length, 30);
  assert.ok(listSkills(reg, { status: null }).length > 100);
});

const cases = [
  ["can I sign this NDA from a vendor", "contracts/nda-triage"],
  ["we had a ransomware attack, who do we need to notify", "privacy/breach-response"],
  ["review our DPDPA consent notice and gaps", "privacy/dpdpa-compliance"],
  ["outside counsel invoice looks inflated, check billing guidelines", "outside-counsel/invoice-review"],
  ["is this AGPL dependency okay to ship", "ip/open-source-review"],
  ["preserve documents, we expect to be sued", "disputes/litigation-hold"],
  ["classify our AI hiring tool under the EU AI Act", "regulatory/ai-governance"],
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
  assert.throws(() => buildSystemPrompt(reg, ["contracts/redline-generator"]), /planned/);
});

test("wrapDocuments escapes names", () => {
  assert.match(wrapDocuments([{ name: 'a"b', text: "x" }]), /name="a'b"/);
});
