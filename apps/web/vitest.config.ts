import { defineConfig } from "vitest/config";

// Pure unit tests for apps/web library code (no Next.js runtime, no DB).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
