import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX in this module uses the automatic runtime (same as Next.js) —
  // no `import React` at the top of .jsx files. Without this, the
  // render-smoke tests fail with "React is not defined".
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Pure unit tests — Prisma is mocked at the module boundary.
  },
});
