import { describe, it } from "vitest";
import { runEvalSuite, labelScore, assertEvalThreshold, formatEvalReport } from "@aegis/ai";
import { scoreContractClauses, bandForScore, type ScoredClauseInput } from "../src/internal/risk-score";

/**
 * EVAL — deterministic contract risk banding (CI-safe).
 *
 * Golden clause sets → the risk band the scorer MUST assign. Exact-band match,
 * bar = 100%: a weighting change that silently re-bands a portfolio (the exact
 * "AI quietly regrades contracts" regression the harness exists to catch) fails
 * the build. Off-by-one bands get half credit in the report for diagnosis but
 * still fail the pass bar.
 */
interface RiskCase {
  name: string;
  clauses: ScoredClauseInput[];
  expected: "LOW" | "MEDIUM" | "HIGH" | "UNSCORED";
}

const c = (type: string, risk: "LOW" | "MEDIUM" | "HIGH", deviation = false): ScoredClauseInput => ({ type, risk, deviation });

const CASES: RiskCase[] = [
  { name: "empty", clauses: [], expected: "UNSCORED" },
  { name: "single-low-clean", clauses: [c("PAYMENT", "LOW")], expected: "LOW" },
  { name: "all-low-clean", clauses: [c("PAYMENT", "LOW"), c("TERMINATION", "LOW"), c("NOTICES", "LOW")], expected: "LOW" },
  { name: "uncapped-liability-high-dev", clauses: [c("LIABILITY_CAP", "HIGH", true)], expected: "HIGH" },
  { name: "high-dev-among-benign", clauses: [c("LIABILITY_CAP", "HIGH", true), c("PAYMENT", "LOW"), c("NOTICES", "LOW"), c("TERMINATION", "LOW"), c("WARRANTY", "LOW")], expected: "HIGH" },
  { name: "medium-dev-mixed", clauses: [c("AUTO_RENEWAL", "MEDIUM", true), c("PAYMENT", "LOW"), c("NOTICES", "LOW")], expected: "MEDIUM" },
  { name: "two-high-clean", clauses: [c("IP", "HIGH"), c("INDEMNITY", "HIGH")], expected: "MEDIUM" },
];

function run() {
  return runEvalSuite(
    CASES,
    (rc: RiskCase) => bandForScore(scoreContractClauses(rc.clauses).score),
    (expected, got) => labelScore(expected as string, got as string, { order: ["LOW", "MEDIUM", "HIGH"], tolerance: 1 }),
  );
}

describe("EVAL — contract risk banding", () => {
  it("assigns the correct risk band for every golden clause set (exact, 100%)", () => {
    const report = run();
    // eslint-disable-next-line no-console
    if (report.failures.length) console.log(formatEvalReport(report, "risk-band"));
    assertEvalThreshold(report, { minPassRate: 1, label: "risk-band" });
  });
});
