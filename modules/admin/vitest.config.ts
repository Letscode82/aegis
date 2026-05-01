import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The DB-dependent suite (admin-guards.test.ts) runs serially in
    // a single fork so concurrent inserts don't collide on the audit
    // chain's per-organisation advisory lock from outside its scope.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});

