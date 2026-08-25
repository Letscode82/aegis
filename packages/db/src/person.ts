/**
 * Person de-duplication guardrail.
 *
 * `findOrCreatePersonByEmail` is the standard way to turn an (email, name) into
 * a Person: it REUSES an existing row for the same (organization, email) instead
 * of creating a second one. Adopt this at every runtime site that mints a Person
 * from an external source (M365 directory adds, custodian picks, inbound email,
 * counterparty contacts) so the duplicate-custodian problem can't recur.
 *
 * Note: seed scripts intentionally create role-specific personas and are exempt;
 * a DB-level unique index on (organizationId, lower(email)) is the belt-and-
 * suspenders complement, but it requires the seed to be dedup-aware first.
 */
import { prisma } from "./client";
import { PersonType, type Person } from "@prisma/client";

export interface FindOrCreatePersonInput {
  email: string;
  name: string;
  type?: PersonType;
  externalRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Return the existing Person for (organization, email) — matched
 * case-insensitively, oldest first — or create one. When `email` is blank a new
 * Person is always created (nothing to dedupe on). The boolean says which path
 * ran, so callers can audit only genuine creates.
 */
export async function findOrCreatePersonByEmail(
  organizationId: string,
  input: FindOrCreatePersonInput,
): Promise<{ person: Person; created: boolean }> {
  const email = (input.email ?? "").trim();
  if (email) {
    const existing = await prisma.person.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return { person: existing, created: false };
  }
  const person = await prisma.person.create({
    data: {
      organizationId,
      name: input.name.trim(),
      email: email || null,
      type: input.type ?? PersonType.EMPLOYEE,
      externalRef: input.externalRef ?? undefined,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
  return { person, created: true };
}
