/**
 * @aegis/types — cross-cutting TypeScript types.
 *
 * Domain-specific types live with their owning module/package. Only types
 * that are genuinely shared across the platform (e.g. branded ID strings,
 * pagination envelopes, common enum unions) belong here.
 *
 * Step 2 will populate this with the shared entity types generated from
 * Prisma. For now, only the foundational utilities are defined.
 */

/** ISO-8601 timestamp string. */
export type ISODateTime = string;

/** Branded ID type to prevent cross-module ID confusion. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

/** Standard cursor-paginated response envelope. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Result type for operations that may fail. */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
