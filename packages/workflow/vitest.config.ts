import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // engine-db.test.ts runs serially in a single fork so concurrent
    // inserts don't collide on the audit chain's per-organisation
    // advisory lock (same setup as @aegis/admin's guard suite).
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
