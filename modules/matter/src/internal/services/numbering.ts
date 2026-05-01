/**
 * Per-organisation matter numbering.
 *
 * The numbering format string lives on MatterTypeConfig.numberingFormat.
 * Default: "M-{YYYY}-{SEQ:4}" — matters are M-2026-0001, M-2026-0002, …
 *
 * Placeholders:
 *   {YYYY}     four-digit year (UTC)
 *   {YY}       two-digit year
 *   {TYPE}     uppercase short code for matter type (LIT/MA/IP/…)
 *   {SEQ:n}    zero-padded sequence — n is the width
 *
 * Number assignment is serialised per-(organisation, type) via a
 * SELECT ... FOR UPDATE on the MatterTypeConfig row so concurrent
 * creates can't collide on a sequence value.
 */
import { prisma, type MatterType } from "@aegis/db";

const TYPE_SHORT_CODES: Record<MatterType, string> = {
  LITIGATION: "LIT",
  TRANSACTIONAL: "TXN",
  MA: "MA",
  IP: "IP",
  EMPLOYMENT: "EMP",
  REGULATORY: "REG",
  INVESTIGATION: "INV",
  ADVISORY: "ADV",
  OTHER: "GEN",
};

const DEFAULT_FORMAT = "M-{YYYY}-{SEQ:4}";

export async function ensureMatterTypeConfig(
  organizationId: string,
  matterType: MatterType,
): Promise<{ numberingFormat: string }> {
  const existing = await prisma.matterTypeConfig.findUnique({
    where: { organizationId_matterType: { organizationId, matterType } },
  });
  if (existing) return { numberingFormat: existing.numberingFormat };
  const created = await prisma.matterTypeConfig.create({
    data: { organizationId, matterType },
  });
  return { numberingFormat: created.numberingFormat };
}

function applyFormat(
  format: string,
  matterType: MatterType,
  sequence: number,
  now: Date,
): string {
  const yyyy = now.getUTCFullYear().toString();
  const yy = yyyy.slice(-2);
  const typeCode = TYPE_SHORT_CODES[matterType];

  let out = format
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{TYPE\}/g, typeCode);

  out = out.replace(/\{SEQ:(\d+)\}/g, (_match, widthStr) => {
    const width = Math.max(1, Math.min(20, Number(widthStr) || 4));
    return String(sequence).padStart(width, "0");
  });

  return out;
}

/**
 * Reserve and format the next matter number for (org, type). Increments
 * MatterTypeConfig.numberingSequence atomically.
 */
export async function assignMatterNumber(
  organizationId: string,
  matterType: MatterType,
): Promise<string> {
  // Atomic increment — Prisma's update is single-statement so we get
  // sequence-style monotonicity for concurrent calls (Postgres serialises
  // row updates).
  let config = await prisma.matterTypeConfig.findUnique({
    where: { organizationId_matterType: { organizationId, matterType } },
  });
  if (!config) {
    config = await prisma.matterTypeConfig.create({
      data: { organizationId, matterType },
    });
  }
  const updated = await prisma.matterTypeConfig.update({
    where: { id: config.id },
    data: { numberingSequence: { increment: 1 } },
  });
  const format = updated.numberingFormat || DEFAULT_FORMAT;
  return applyFormat(format, matterType, updated.numberingSequence, new Date());
}

/** Exposed for unit testing the format expansion. */
export const __test__ = { applyFormat, TYPE_SHORT_CODES };
