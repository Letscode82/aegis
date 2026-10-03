import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SEVERITY_LEVELS,
  SEVERITY_META,
  normalizeSeverity,
  severityFromRisk,
  severityRank,
  isSeverity,
  rollUpOverall,
  coerceFinding,
  coerceFindings,
  OUTPUT_CONTRACT_FIELDS,
  FINDING_FIELDS,
} from "../output-contract.mjs";

const shared = (name) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "_shared", name), "utf8");

test("code severity levels + labels stay in lock-step with severity-scale.md", () => {
  const md = shared("severity-scale.md");
  // Every level + its label must appear in the markdown table row, so the
  // executable mirror can never silently drift from the human spec.
  for (const level of SEVERITY_LEVELS) {
    const { label } = SEVERITY_META[level];
    const row = new RegExp(`\\*\\*${level}\\*\\*\\s*\\|\\s*${label}\\b`);
    assert.match(md, row, `${level} / ${label} row missing from severity-scale.md`);
  }
  // No extra levels defined in code beyond the five the spec names.
  assert.deepEqual(SEVERITY_LEVELS, ["S1", "S2", "S3", "S4", "Info"]);
  assert.deepEqual(Object.keys(SEVERITY_META).sort(), [...SEVERITY_LEVELS].sort());
});

test("output-contract top-level + finding fields match output-contract.md", () => {
  const md = shared("output-contract.md");
  for (const f of OUTPUT_CONTRACT_FIELDS) assert.ok(md.includes(`"${f}"`), `${f} missing from output-contract.md`);
  for (const f of FINDING_FIELDS) assert.ok(md.includes(`"${f}"`), `finding field ${f} missing from output-contract.md`);
});

test("normalizeSeverity accepts S-levels, digits, and legacy risk words", () => {
  assert.equal(normalizeSeverity("S1"), "S1");
  assert.equal(normalizeSeverity("s2"), "S2");
  assert.equal(normalizeSeverity("3"), "S3");
  assert.equal(normalizeSeverity(4), "S4");
  assert.equal(normalizeSeverity("Critical"), "S1");
  assert.equal(normalizeSeverity("high"), "S2");
  assert.equal(normalizeSeverity("Medium"), "S3");
  assert.equal(normalizeSeverity("low"), "S4");
  assert.equal(normalizeSeverity("none"), "Info");
  assert.equal(normalizeSeverity("info"), "Info");
});

test("normalizeSeverity returns the fallback for unknown / empty input", () => {
  assert.equal(normalizeSeverity(undefined), null);
  assert.equal(normalizeSeverity(""), null);
  assert.equal(normalizeSeverity("wat"), null);
  assert.equal(normalizeSeverity("wat", "S2"), "S2");
  assert.equal(severityFromRisk("Critical"), "S1");
  assert.equal(severityFromRisk("nonsense", "Info"), "Info");
});

test("severityRank orders most-severe first; isSeverity is exact", () => {
  assert.ok(severityRank("S1") < severityRank("S2"));
  assert.ok(severityRank("S4") < severityRank("Info"));
  assert.equal(severityRank("bogus"), 99);
  assert.ok(isSeverity("S1"));
  assert.ok(!isSeverity("s1"));
  assert.ok(!isSeverity("Critical"));
});

test("rollUpOverall takes the highest severity", () => {
  assert.equal(rollUpOverall([{ severity: "S3" }, { severity: "S1" }, { severity: "S4" }]), "S1");
  assert.equal(rollUpOverall([{ severity: "S4" }, { severity: "Info" }]), "S4");
  assert.equal(rollUpOverall([]), null);
  assert.equal(rollUpOverall([{ title: "no severity" }]), null);
});

test("rollUpOverall bumps 3+ same-area S2 findings to S1", () => {
  const sameArea = [
    { severity: "S2", category: "liability" },
    { severity: "S2", category: "liability" },
    { severity: "S2", category: "liability" },
  ];
  assert.equal(rollUpOverall(sameArea), "S1");
  // Spread across different areas → stays S2.
  const spread = [
    { severity: "S2", category: "liability" },
    { severity: "S2", category: "data" },
    { severity: "S2", category: "term" },
  ];
  assert.equal(rollUpOverall(spread), "S2");
});

test("coerceFinding normalises to the contract shape and drops unknown keys", () => {
  const f = coerceFinding({ severity: "critical", likelihood: "LIKELY", confidence: "High", title: "x", bogus: 1 }, 0);
  assert.equal(f.severity, "S1");
  assert.equal(f.likelihood, "likely");
  assert.equal(f.confidence, "high");
  assert.equal(f.id, "F1");
  assert.ok(!("bogus" in f));
  assert.deepEqual(Object.keys(f).sort(), [...FINDING_FIELDS].sort());
});

test("coerceFinding nulls out invalid likelihood / confidence", () => {
  const f = coerceFinding({ severity: "S2", likelihood: "maybe", confidence: "ok" });
  assert.equal(f.likelihood, null);
  assert.equal(f.confidence, null);
});

test("coerceFindings filters non-objects", () => {
  assert.equal(coerceFindings([{ severity: "S1" }, null, "x", 3]).length, 1);
  assert.deepEqual(coerceFindings("nope"), []);
});
