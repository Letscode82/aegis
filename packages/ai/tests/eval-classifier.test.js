import { describe, it, expect } from "vitest";
import { classifyIntakeRegex } from "../src/classify-regex.js";
import { evaluateClassifier } from "../src/eval.js";

// Golden set — one+ representative request per category, plus null cases the
// deterministic classifier should decline (they route to the caller's default /
// Claude). Regression guard: if a pattern edit breaks these, CI catches it.
const GOLDEN = [
  { text: "An employee filed a harassment complaint against her manager.", expected: "Employment — Sensitive" },
  { text: "HR reports possible discrimination in a recent termination.", expected: "Employment — Sensitive" },
  { text: "We were served with a subpoena in the Acme lawsuit.", expected: "Litigation — Non-Court" },
  { text: "Received a cease and desist letter from a competitor.", expected: "Litigation — Non-Court" },
  { text: "Please prepare a mutual NDA for our meeting with Acme Corp.", expected: "NDA — Standard" },
  { text: "Review the covenant terms on our $50m credit facility.", expected: "Finance — Debt / Covenant" },
  { text: "Trademark clearance for our new product name, please.", expected: "IP / Trademark / OSS" },
  { text: "Open source license review for a new OSS dependency.", expected: "IP / Trademark / OSS" },
  { text: "GDPR review needed for a new personal data pipeline.", expected: "Privacy — DPIA / GDPR" },
  { text: "Screen this counterparty for OFAC sanctions exposure.", expected: "Compliance — Sanctions" },
  { text: "Client-facing compliance statement for the EU AI Act.", expected: "Regulatory — EU" },
  { text: "New vendor SaaS subscription MSA worth $200k.", expected: "Vendor Contract" },
  { text: "Enhanced due diligence on a vendor in Brazil.", expected: "Vendor DD" },
  // Null cases — should decline.
  { text: "Can you point me to the org chart?", expected: null },
  { text: "What is the status of my earlier request?", expected: null },
];

describe("intake regex classifier — golden set (EVAL1)", () => {
  it("meets the accuracy bar with no critical-category misses", () => {
    const report = evaluateClassifier(GOLDEN, classifyIntakeRegex);
    // Surface any drift in the failure output for a fast diagnosis.
    if (report.accuracy < 0.9) console.error("classifier failures:", report.failures);
    expect(report.accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it("never misses the two auto-escalate categories", () => {
    const critical = GOLDEN.filter((c) => c.expected === "Employment — Sensitive" || c.expected === "Compliance — Sanctions");
    const report = evaluateClassifier(critical, classifyIntakeRegex);
    expect(report.accuracy).toBe(1);
  });

  it("declines short / vague input", () => {
    expect(classifyIntakeRegex("hi")).toBeNull();
    expect(classifyIntakeRegex("What's next?")).toBeNull();
  });
});

describe("evaluateClassifier", () => {
  it("reports accuracy and failures", () => {
    const fn = (t) => (t.includes("x") ? { cat: "X" } : null);
    const r = evaluateClassifier(
      [
        { text: "has x", expected: "X" },
        { text: "no match", expected: null },
        { text: "also x", expected: "Y" },
      ],
      fn,
    );
    expect(r.total).toBe(3);
    expect(r.correct).toBe(2);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ expected: "Y", got: "X" });
  });

  it("is 100% on an empty set", () => {
    expect(evaluateClassifier([], () => null).accuracy).toBe(1);
  });
});
