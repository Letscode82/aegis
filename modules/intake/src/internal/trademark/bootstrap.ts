/**
 * Trademark reference bootstrap — a curated set of well-known REGISTERED
 * marks (public record) across NICE classes, so the knock-out screen
 * produces real conflicts out of the box for demo/CI. Same "seed a
 * bootstrap, upgrade to a live feed" path the OFAC sanctions data took.
 *
 * Production upgrade: refreshTrademarkMarks() is structured to pull from
 * the USPTO open trademark API (per-class, LIVE marks) — swap the loader
 * and the screen runs against the full register. Until then it upserts this
 * bootstrap so the admin refresh trigger always resets staleness.
 */
import { prisma } from "@aegis/db";
import { normalizeMark } from "./similarity";
import { TRADEMARK_BOOTSTRAP } from "./bootstrap-data";

export const BOOTSTRAP_COUNT = TRADEMARK_BOOTSTRAP.length;

/**
 * Upsert the reference marks (bootstrap by default). Idempotent; stamps
 * refreshedAt=now so the screen sees fresh data. Returns rows written.
 */
export async function refreshTrademarkMarks(): Promise<{ written: number; source: string }> {
  const now = new Date();
  let written = 0;
  for (const m of TRADEMARK_BOOTSTRAP) {
    await prisma.trademarkMark.upsert({
      where: { source_sourceRef: { source: "BOOTSTRAP", sourceRef: m.ref } },
      create: {
        source: "BOOTSTRAP",
        sourceRef: m.ref,
        wordMark: m.wordMark,
        normalizedMark: normalizeMark(m.wordMark),
        niceClasses: m.classes,
        status: m.status || "LIVE",
        ownerName: m.owner,
        refreshedAt: now,
      },
      update: {
        wordMark: m.wordMark,
        normalizedMark: normalizeMark(m.wordMark),
        niceClasses: m.classes,
        status: m.status || "LIVE",
        ownerName: m.owner,
        refreshedAt: now,
      },
    });
    written += 1;
  }
  return { written, source: "BOOTSTRAP" };
}

/** Seed helper — writes bootstrap only if the table is empty (idempotent). */
export async function seedTrademarkMarksIfEmpty(): Promise<number> {
  const count = await prisma.trademarkMark.count();
  if (count > 0) return 0;
  const { written } = await refreshTrademarkMarks();
  return written;
}
