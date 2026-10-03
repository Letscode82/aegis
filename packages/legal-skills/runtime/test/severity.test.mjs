import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEVERITY, SEVERITY_LEVELS, overallSeverity, isBlocking,
  inferSeverity, confidenceLabel, buildOutputContract,
} from "../severity.mjs";

test("the scale is S1..S4 + Info with S1 highest-ranked and blocking", () => {
  assert.deepEqual(SEVERITY_LEVELS, ["S1", "S2", "S3", "S4", "Info"]);
  assert.ok(SEVERITY.S1.rank > SEVERITY.S2.rank);
  assert.ok(SEVERITY.S2.rank > SEVERITY.S3.rank);
  assert.equal(isBlocking("S1"), true);
  assert.equal(isBlocking("S2"), true);
  assert.equal(isBlocking("S3"), false);
  assert.equal(isBlocking("Info"), false);
});

test("overallSeverity returns the highest level, null when empty/unknown", () => {
  assert.equal(overallSeverity(["S3", "S1", "S4"]), "S1");
  assert.equal(overallSeverity(["S4", "Info"]), "S4");
  assert.equal(overallSeverity([]), null);
  assert.equal(overallSeverity(["nonsense"]), null);
});

test("inferSeverity places findings conservatively", () => {
  assert.equal(inferSeverity("Uncapped indemnity for data breach"), "S1");
  assert.equal(inferSeverity("Playbook deviation: 90-day auto-renewal"), "S2");
  assert.equal(inferSeverity("Minor typo in the recitals"), "S4");
  assert.equal(inferSeverity("General commercial point to weigh"), "S3");
  assert.equal(inferSeverity(""), "Info");
});

test("confidenceLabel maps a 0..1 number to high/medium/low", () => {
  assert.equal(confidenceLabel(0.9), "high");
  assert.equal(confidenceLabel(0.6), "medium");
  assert.equal(confidenceLabel(0.4), "low");
  assert.equal(confidenceLabel(undefined), "low");
});

test("buildOutputContract sorts findings, derives overall + escalation", () => {
  const c = buildOutputContract({
    skill: "okf/contract-review-agent",
    bottomLine: "Do not sign as drafted.",
    findings: [
      { title: "Minor drafting nit", severity: "S4" },
      { title: "Uncapped liability", severity: "S1", analysis: "Carve-out from the cap." },
    ],
  });
  assert.equal(c.findings[0].severity, "S1"); // highest first
  assert.equal(c.overall, "S1");
  assert.equal(c.escalation.required, true);
  assert.equal(c.review.status, "draft");
  assert.match(c.$schema, /aegis\.output-contract\.v\d+/);
});

test("buildOutputContract infers severity when a finding omits it", () => {
  const c = buildOutputContract({ findings: [{ title: "Uncapped indemnity" }, { title: "wording tidy-up" }] });
  assert.equal(c.overall, "S1");
  assert.equal(c.escalation.required, true);
});

test("no findings → overall null, escalation not required", () => {
  const c = buildOutputContract({ skill: "okf/faq-agent", bottomLine: "Answered." });
  assert.equal(c.overall, null);
  assert.equal(c.escalation.required, false);
  assert.deepEqual(c.findings, []);
});
