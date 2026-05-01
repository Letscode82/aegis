/**
 * Wire-format helpers — Decimal/Date → JSON-friendly types.
 *
 * Prisma returns Decimals as bigint-precision objects and Dates as
 * Date instances. The matter UI consumes JSON over HTTP, so we
 * serialise consistently at the route boundary.
 */
export function serializeMatter<
  T extends Record<string, unknown>,
>(matter: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(matter)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (
      v !== null &&
      typeof v === "object" &&
      v.constructor &&
      (v as { constructor: { name: string } }).constructor.name === "Decimal"
    ) {
      out[k] = Number(String(v));
    } else {
      out[k] = v;
    }
  }
  return out;
}
