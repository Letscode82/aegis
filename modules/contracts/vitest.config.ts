import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Pure unit tests — the clause/obligation derivation helpers have no
    // DB dependency.
  },
});
