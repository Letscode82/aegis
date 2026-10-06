/**
 * Mutation safety gate.
 *
 * People run live demos against the production/demo database. The test suite
 * must never write junk into it. These helpers enforce that:
 *
 *  - Read-only tests (the default) always run.
 *  - A `@mutation` test is skipped unless BOTH:
 *      E2E_TARGET=test           (operator asserts this is a throwaway DB / org)
 *      E2E_ALLOW_MUTATIONS=1     (operator opts in to running write flows)
 *
 * So the worst case of a misconfigured run against the demo is a batch of
 * read-only page loads — no rows created, no login changed.
 */
import { test } from "@playwright/test";

export const MUTATIONS_ENABLED =
  process.env.E2E_ALLOW_MUTATIONS === "1" && process.env.E2E_TARGET === "test";

export const TARGET_IS_TEST_DB = process.env.E2E_TARGET === "test";

/**
 * Call at the top of a `@mutation`-tagged test body. Skips the test (with a
 * clear reason) unless the operator has explicitly green-lit writes against a
 * declared test database.
 */
export function requireMutationsEnabled(): void {
  test.skip(
    !MUTATIONS_ENABLED,
    "Write flow skipped: set E2E_TARGET=test and E2E_ALLOW_MUTATIONS=1 to run against a throwaway DB. " +
      "Read-only coverage runs regardless so the live demo is never written to.",
  );
}

/**
 * A unique, obviously-synthetic label for any row a mutation test does create,
 * so leftovers are easy to spot and purge if a test DB is reused.
 */
export function e2eTag(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `E2E-${prefix}-${stamp}-${rand}`;
}
