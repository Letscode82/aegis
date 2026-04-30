/**
 * Process-wide PrismaClient singleton.
 *
 * Why a singleton: Prisma opens a connection pool. Re-creating the client
 * (e.g. on every Next.js dev-mode hot reload, or on every API route
 * invocation) leaks connections until Postgres rejects them. We hang the
 * instance off `globalThis` so it survives module re-execution.
 *
 * The singleton is server-only. Importing this in a client component will
 * fail at bundle time (Prisma's engine cannot run in a browser) — that
 * boundary is exactly what we want.
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __aegis_prisma__: PrismaClient | undefined;
}

const log =
  process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"];

export const prisma: PrismaClient =
  globalThis.__aegis_prisma__ ??
  new PrismaClient({
    log: log as Array<"query" | "info" | "warn" | "error">,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__aegis_prisma__ = prisma;
}
