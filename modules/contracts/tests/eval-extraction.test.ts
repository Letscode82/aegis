import { describe, it, expect } from "vitest";
import { runEvalSuite, setScore, assertEvalThreshold, formatEvalReport } from "@aegis/ai";
import { extractContractKnowledge } from "../src/internal/extract";

/**
 * EVAL — contract clause extraction (deterministic engine, CI-safe).
 *
 * Golden contract snippets → the clause types the extractor MUST surface and
 * the ones it MUST flag as deviating from our paper. Scored by recall (subset):
 * extra detections don't fail, but a regression that stops detecting a known
 * risky clause drops recall below the bar and fails the build. This is the
 * guard that keeps "contract understanding reads the real document" honest.
 */
interface ExtractCase {
  name: string;
  text: string;
  contractType: string;
  expected: string[]; // clause types that must be detected
  expectedDeviations: string[]; // of those, the ones that must be flagged deviation=true
}

const CASES: ExtractCase[] = [
  {
    name: "uncapped-liability",
    text: "Vendor's total liability under this Agreement shall be unlimited and uncapped for any and all damages, losses, and expenses.",
    contractType: "MSA",
    expected: ["LIABILITY_CAP"],
    expectedDeviations: ["LIABILITY_CAP"],
  },
  {
    name: "net30-prepay-payment",
    text: "All invoices are due Net 30 from the date of receipt. Customer shall prepay the first month in advance before services begin.",
    contractType: "MSA",
    expected: ["PAYMENT"],
    expectedDeviations: ["PAYMENT"],
  },
  {
    name: "foreign-governing-law",
    text: "This Agreement shall be governed by and construed in accordance with the laws of England and Wales, and the courts of London shall have exclusive jurisdiction.",
    contractType: "MSA",
    expected: ["GOVERNING_LAW"],
    expectedDeviations: ["GOVERNING_LAW"],
  },
  {
    name: "perpetual-confidentiality",
    text: "The receiving party shall keep all Confidential Information and proprietary information secret in perpetuity, with no time limit or expiration.",
    contractType: "NDA",
    expected: ["CONFIDENTIALITY"],
    expectedDeviations: ["CONFIDENTIALITY"],
  },
  {
    name: "evergreen-auto-renewal",
    text: "This Agreement will automatically renew for successive perpetual renewal terms with no notice required by either party.",
    contractType: "MSA",
    expected: ["AUTO_RENEWAL"],
    expectedDeviations: ["AUTO_RENEWAL"],
  },
  {
    name: "residuals-clause",
    text: "The receiving party may use any residual knowledge and general learning retained in the unaided memory of its personnel.",
    contractType: "NDA",
    expected: ["RESIDUALS"],
    expectedDeviations: ["RESIDUALS"],
  },
  {
    name: "standard-mutual-indemnity",
    text: "Each party shall indemnify and hold harmless the other for third-party claims arising from its own breach or negligence.",
    contractType: "MSA",
    expected: ["INDEMNITY"],
    expectedDeviations: [], // mutual third-party = on-playbook, not a deviation
  },
];

function run() {
  return runEvalSuite(
    CASES,
    (c: ExtractCase) => extractContractKnowledge(c.text, c.contractType),
    (expected, got: any, c: ExtractCase) => {
      const types: string[] = (got?.clauses || []).map((cl: any) => cl.type);
      const devTypes: string[] = (got?.clauses || []).filter((cl: any) => cl.deviation).map((cl: any) => cl.type);
      const typeScore = setScore(c.expected, types); // recall-only
      const devScore = setScore(c.expectedDeviations, devTypes); // recall-only
      const pass = typeScore.pass && devScore.pass;
      const detail = [typeScore.detail && `types: ${typeScore.detail}`, devScore.detail && `deviations: ${devScore.detail}`]
        .filter(Boolean).join(" | ") || undefined;
      return { pass, score: (typeScore.score + devScore.score) / 2, detail };
    },
  );
}

describe("EVAL — contract clause extraction recall", () => {
  it("detects every expected clause type and flags expected deviations (recall ≥ 1.0)", () => {
    const report = run();
    // eslint-disable-next-line no-console
    if (report.failures.length) console.log(formatEvalReport(report, "extraction"));
    assertEvalThreshold(report, { minPassRate: 1, label: "contract-extraction" });
  });

  it("seeds an NDA return/destroy obligation even on a terse request", () => {
    const k = extractContractKnowledge("Please prepare a mutual NDA for discussions with Acme.", "NDA");
    expect(k.obligations.length).toBeGreaterThan(0);
  });
});
