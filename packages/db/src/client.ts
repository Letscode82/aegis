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

// ── W4-5 — slow-query flagging ───────────────────────────────────────
// Every Prisma operation is timed; anything past AEGIS_SLOW_QUERY_MS
// (default 500ms) emits ONE structured JSON warn line so a log drain
// can alert on "slow-query" events. Installed once per client (the
// guard survives hot reloads on the globalThis singleton).
declare global {
  // eslint-disable-next-line no-var
  var __aegis_prisma_slowlog__: boolean | undefined;
}

const SLOW_QUERY_MS = (() => {
  const raw = Number(process.env.AEGIS_SLOW_QUERY_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
})();

if (!globalThis.__aegis_prisma_slowlog__) {
  globalThis.__aegis_prisma_slowlog__ = true;
  prisma.$use(async (params, next) => {
    const started = Date.now();
    const result = await next(params);
    const ms = Date.now() - started;
    if (ms >= SLOW_QUERY_MS) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          kind: "slow-query",
          model: params.model ?? "$raw",
          action: params.action,
          ms,
          thresholdMs: SLOW_QUERY_MS,
        }),
      );
    }
    return result;
  });
}
