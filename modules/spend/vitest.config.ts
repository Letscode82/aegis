import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Pure unit tests — the review rule engine has no DB dependency.
  },
});
