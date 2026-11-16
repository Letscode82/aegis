# AI evaluation harness

AEGIS's AI is the product differentiator, so its **quality** — not just that a
call succeeds — is a thing we regression-test. This doc describes the eval
harness and how to extend it.

## The problem it solves

Every AI surface (contract drafting, clause extraction, risk scoring, playbook
review grading, intake classification) has a **deterministic engine** behind it
that runs when the model is unavailable, plus the Claude-backed path on top. A
prompt tweak, a model swap, or a regex edit can silently change what the system
decides — a contract quietly re-graded from MEDIUM to LOW, a required clause no
longer flagged as missing — and a shape-only unit test won't catch it.

The eval harness scores engine **output against a golden dataset** with explicit
accuracy bars, so a quality regression fails the build instead of shipping.

## The harness (`@aegis/ai`)

Two layers, both exported from `@aegis/ai`:

```ts
import {
  runEvalSuite, runEvalSuiteAsync,   // run labeled cases through an engine
  exactScore, setScore, labelScore,  // scoring strategies
  assertEvalThreshold, formatEvalReport,
  evaluateClassifier,                // EVAL1, the original classifier-only eval
} from "@aegis/ai";
```

- **`runEvalSuite(cases, runFn, scoreFn)`** — runs each case through `runFn`,
  scores it with `scoreFn`, returns `{ total, passed, passRate, meanScore,
  results, failures }`. A thrown `runFn` is recorded as a failed case, never a
  crash. `runEvalSuiteAsync` is the same for an async `runFn` (e.g. a real
  Claude call).
- **Scoring strategies** — `scoreFn(expected, got, case) => { pass, score?,
  detail? }`:
  - `exactScore` — exact equality (classification, grading).
  - `setScore(expected[], got[], opts)` — set overlap: recall (how much of
    `expected` was found), precision, F1. Recall-only pass by default;
    `requirePrecision` switches to F1 + no-extras. Takes a `key` extractor for
    arrays of objects.
  - `labelScore(expected, got, { order, tolerance })` — ordinal labels with
    optional adjacency half-credit (an off-by-one band fails but is surfaced for
    diagnosis).
- **`assertEvalThreshold(report, { minPassRate, minMeanScore, label })`** —
  throws a readable, failure-listing error when below bar. Call it inside a
  `vitest` `it(...)` so the bar is CI-enforced.
- **`formatEvalReport(report, title)`** — one line per case, for a script.

## The suites

### CI-safe (deterministic, run in `pnpm test`)

These point `runFn` at a deterministic engine, so they need no API key and are
reproducible. They are the regression guard.

| Suite | File | Engine under test | Bar |
|---|---|---|---|
| Intake classification | `packages/ai/tests/eval-classifier.test.js` | `classifyIntakeRegex` | golden-set accuracy |
| Harness self-test | `packages/ai/tests/eval-harness.test.js` | the harness itself | n/a |
| Contract extraction | `modules/contracts/tests/eval-extraction.test.ts` | `extractContractKnowledge` | clause-type + deviation recall = 1.0 |
| Risk banding | `modules/contracts/tests/eval-risk.test.ts` | `scoreContractClauses` + `bandForScore` | exact band = 100% |
| Review grading | `modules/contracts/tests/eval-review.test.ts` | `buildReviewFindings` | exact grade = 100% |

**Extending:** add a case to the relevant `CASES` array. If a legitimate engine
improvement changes an expected value, update the golden value in the same PR —
that diff is the audit trail for "we intended this quality change."

### Live (API) evals — offline / nightly

The same suites can score the **real Claude path** by making `runFn` an async
call and using `runEvalSuiteAsync`. These are **not** in CI (they cost tokens
and are non-deterministic); run them locally or on a schedule when a key is set:

```ts
// pattern — not run in CI
const report = await runEvalSuiteAsync(CASES, async (c) => callContractAI(c.text), scoreFn);
console.log(formatEvalReport(report, "contract-ai (live)"));
```

Gate a live runner on `process.env.ANTHROPIC_API_KEY` so it no-ops without a
key. Because the deterministic engine is the degraded fallback, the CI suites
already pin the floor; the live eval measures the lift the model adds on top.

## Principle

Golden values encode intended behavior. A failing eval means one of two things:
a regression to fix, or an intended improvement to record by updating the
golden value. Never relax a bar or delete a case to get green — that defeats the
purpose exactly the way skipping a failing test does.
