import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Audit-chain tests rely on Postgres triggers; running suites in parallel
    // would let two tests insert into the same chain concurrently. The CI
    // integrity job runs against a single dedicated DB, so a single fork is
    // both correct and fast enough.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
