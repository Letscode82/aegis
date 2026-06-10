/**
 * Assignable-user directory for intake ticket assignment (P1b).
 *
 * Server-only — consumed by `GET /api/intake/assignees` in apps/web.
 * Returns the org's active legal-team users (roles that can own
 * ticket work). Requesters / external counsel / viewers are excluded:
 * assigning a ticket to someone who can't act on it is an input
 * error, so the picker never offers them.
 */
import { prisma } from "@aegis/db";

/** Roles whose members can be assigned intake tickets. */
const ASSIGNABLE_ROLES = [
  "admin",
  "gc",
  "attorney",
  "paralegal",
  "legal_ops",
] as const;

export interface IntakeAssignee {
  /** User.id — what `IntakeTicket.assignedToUserId` stores. */
  id: string;
  name: string;
  email: string;
  roleName: string | null;
}

export async function listAssignableUsers(
  organizationId: string,
): Promise<IntakeAssignee[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      suspendedAt: null,
      role: { name: { in: [...ASSIGNABLE_ROLES] } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleName: u.role?.name ?? null,
  }));
}
