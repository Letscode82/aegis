import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Pure unit tests — Prisma is mocked at the @aegis/db boundary.
  },
});
