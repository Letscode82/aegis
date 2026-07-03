/**
 * Item 5 (tiering) — intake pool (team) persistence + the DB-backed
 * pool resolver that the Smart Routing chokepoint uses to load-balance
 * route-to-pool actions.
 *
 * Server-only. The *selection* semantics live in ./pool.js (pure);
 * this module owns persistence, audit, and computing each member's
 * live open-ticket load. DRL's competency/seniority tiers are modelled
 * as teams: a routing rule points at a team, the engine picks the
 * least-loaded (or round-robin) active member, and overflows to the
 * pool's `overflowTeam` when everyone is at capacity.
 */
import { prisma, logAudit, getCurrentUser, IntakeStatus } from "@aegis/db";
import { POOL_STRATEGIES, selectFromPool } from "./pool";
import type { PoolLike, PoolPick } from "./pool";

/** Open = counts against a member's capacity. Closed/rejected don't.
 *  Exported so the pool-ops dashboard (W2-3) counts load identically. */
export const OPEN_TICKET_STATUSES: IntakeStatus[] = [
  IntakeStatus.AWAITING_TRIAGE,
  IntakeStatus.IN_REVIEW,
  IntakeStatus.APPROVED,
  IntakeStatus.ESCALATED,
];

export interface TeamMemberDTO {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  capacity: number;
  active: boolean;
  lastAssignedAt: string | null;
}

export interface TeamDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  strategy: string;
  overflowTeamId: string | null;
  overflowTeamName: string | null;
  sortOrder: number;
  members: TeamMemberDTO[];
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

const TEAM_INCLUDE = {
  overflowTeam: { select: { name: true } },
  members: {
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
  },
} as const;

type TeamRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  strategy: string;
  overflowTeamId: string | null;
  sortOrder: number;
  overflowTeam: { name: string } | null;
  members: Array<{
    id: string;
    userId: string;
    capacity: number;
    active: boolean;
    lastAssignedAt: Date | null;
    user: { name: string | null; email: string | null } | null;
  }>;
};

function toDTO(t: TeamRow): TeamDTO {
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    active: t.active,
    strategy: t.strategy,
    overflowTeamId: t.overflowTeamId,
    overflowTeamName: t.overflowTeam?.name ?? null,
    sortOrder: t.sortOrder,
    members: t.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.user?.name ?? null,
      userEmail: m.user?.email ?? null,
      capacity: m.capacity,
      active: m.active,
      lastAssignedAt: m.lastAssignedAt?.toISOString() ?? null,
    })),
  };
}

export class TeamNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake team ${id} not found`);
    this.name = "TeamNotFoundError";
  }
}

export class TeamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamValidationError";
  }
}

// ── Reads ───────────────────────────────────────────────────────────

export async function listTeams(organizationId: string): Promise<TeamDTO[]> {
  const rows = await prisma.intakeTeam.findMany({
    where: { organizationId },
    include: TEAM_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => toDTO(r as unknown as TeamRow));
}

export async function getTeam(
  organizationId: string,
  teamId: string,
): Promise<TeamDTO> {
  const row = await prisma.intakeTeam.findFirst({
    where: { id: teamId, organizationId },
    include: TEAM_INCLUDE,
  });
  if (!row) throw new TeamNotFoundError(teamId);
  return toDTO(row as unknown as TeamRow);
}

// ── Team CRUD ───────────────────────────────────────────────────────

export interface TeamInput {
  key?: string;
  name?: string;
  description?: string | null;
  active?: boolean;
  strategy?: string;
  overflowTeamId?: string | null;
  sortOrder?: number;
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function assertStrategy(strategy: string) {
  if (!(POOL_STRATEGIES as readonly string[]).includes(strategy)) {
    throw new TeamValidationError(
      `strategy must be one of ${POOL_STRATEGIES.join(", ")}`,
    );
  }
}

export async function createTeam(
  organizationId: string,
  input: TeamInput,
  ctx?: Ctx,
): Promise<TeamDTO> {
  const name = (input.name ?? "").trim();
  if (!name) throw new TeamValidationError("Team name is required");
  const key = normalizeKey(input.key ? input.key : name);
  if (!key) throw new TeamValidationError("Team key is required");
  const strategy = input.strategy ?? "least_loaded";
  assertStrategy(strategy);

  if (input.overflowTeamId) {
    await assertOverflowTarget(organizationId, input.overflowTeamId, null);
  }

  const existing = await prisma.intakeTeam.findFirst({
    where: { organizationId, key },
    select: { id: true },
  });
  if (existing) {
    throw new TeamValidationError(`A team with key "${key}" already exists`);
  }

  const created = await prisma.intakeTeam.create({
    data: {
      organizationId,
      key,
      name,
      description: input.description ?? null,
      active: input.active ?? true,
      strategy,
      overflowTeamId: input.overflowTeamId ?? null,
      sortOrder: input.sortOrder ?? 100,
    },
    include: TEAM_INCLUDE,
  });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.created",
    resourceType: "IntakeTeam",
    resourceId: created.id,
    afterJson: { key, name, strategy, overflowTeamId: input.overflowTeamId ?? null },
  });
  return toDTO(created as unknown as TeamRow);
}

export async function updateTeam(
  organizationId: string,
  teamId: string,
  input: TeamInput,
  ctx?: Ctx,
): Promise<TeamDTO> {
  const before = await prisma.intakeTeam.findFirst({
    where: { id: teamId, organizationId },
    include: TEAM_INCLUDE,
  });
  if (!before) throw new TeamNotFoundError(teamId);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new TeamValidationError("Team name cannot be empty");
    data.name = n;
  }
  if (input.key !== undefined) {
    const k = normalizeKey(input.key);
    if (!k) throw new TeamValidationError("Team key cannot be empty");
    if (k !== before.key) {
      const clash = await prisma.intakeTeam.findFirst({
        where: { organizationId, key: k, id: { not: teamId } },
        select: { id: true },
      });
      if (clash) throw new TeamValidationError(`A team with key "${k}" already exists`);
    }
    data.key = k;
  }
  if (input.description !== undefined) data.description = input.description;
  if (input.active !== undefined) data.active = input.active;
  if (input.strategy !== undefined) {
    assertStrategy(input.strategy);
    data.strategy = input.strategy;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.overflowTeamId !== undefined) {
    if (input.overflowTeamId) {
      await assertOverflowTarget(organizationId, input.overflowTeamId, teamId);
    }
    data.overflowTeamId = input.overflowTeamId;
  }

  const updated = await prisma.intakeTeam.update({
    where: { id: teamId },
    data,
    include: TEAM_INCLUDE,
  });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.updated",
    resourceType: "IntakeTeam",
    resourceId: teamId,
    beforeJson: {
      key: before.key,
      name: before.name,
      active: before.active,
      strategy: before.strategy,
      overflowTeamId: before.overflowTeamId,
    },
    afterJson: {
      key: updated.key,
      name: updated.name,
      active: updated.active,
      strategy: updated.strategy,
      overflowTeamId: updated.overflowTeamId,
    },
    metadata: { teamName: updated.name },
  });
  return toDTO(updated as unknown as TeamRow);
}

export async function deleteTeam(
  organizationId: string,
  teamId: string,
  ctx?: Ctx,
): Promise<void> {
  const before = await prisma.intakeTeam.findFirst({
    where: { id: teamId, organizationId },
    select: { id: true, key: true, name: true },
  });
  if (!before) throw new TeamNotFoundError(teamId);

  // Routing rules that target this team are cleared by the FK
  // (onDelete: SetNull); overflow pointers likewise. No orphaned refs.
  await prisma.intakeTeam.delete({ where: { id: teamId } });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.deleted",
    resourceType: "IntakeTeam",
    resourceId: teamId,
    beforeJson: { key: before.key, name: before.name },
    metadata: { teamName: before.name },
  });
}

/** Guard: overflow target must exist in the org and can't be the team
 *  itself (a one-hop self-cycle). Longer cycles are tolerated at
 *  config time and broken defensively by the pure resolver. */
async function assertOverflowTarget(
  organizationId: string,
  overflowTeamId: string,
  selfId: string | null,
) {
  if (selfId && overflowTeamId === selfId) {
    throw new TeamValidationError("A team cannot overflow to itself");
  }
  const target = await prisma.intakeTeam.findFirst({
    where: { id: overflowTeamId, organizationId },
    select: { id: true },
  });
  if (!target) throw new TeamValidationError("Overflow team not found in this organization");
}

// ── Member CRUD ─────────────────────────────────────────────────────

export interface TeamMemberInput {
  userId?: string;
  capacity?: number;
  active?: boolean;
}

export async function addTeamMember(
  organizationId: string,
  teamId: string,
  input: TeamMemberInput,
  ctx?: Ctx,
): Promise<TeamDTO> {
  const team = await prisma.intakeTeam.findFirst({
    where: { id: teamId, organizationId },
    select: { id: true, name: true },
  });
  if (!team) throw new TeamNotFoundError(teamId);
  const userId = (input.userId ?? "").trim();
  if (!userId) throw new TeamValidationError("userId is required");
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, name: true },
  });
  if (!user) throw new TeamValidationError("User not found in this organization");
  const capacity = input.capacity ?? 0;
  if (capacity < 0) throw new TeamValidationError("capacity cannot be negative");

  const dupe = await prisma.intakeTeamMember.findFirst({
    where: { teamId, userId },
    select: { id: true },
  });
  if (dupe) throw new TeamValidationError("User is already a member of this team");

  await prisma.intakeTeamMember.create({
    data: { teamId, userId, capacity, active: input.active ?? true },
  });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.member_added",
    resourceType: "IntakeTeam",
    resourceId: teamId,
    afterJson: { userId, userName: user.name, capacity },
    metadata: { teamName: team.name },
  });
  return getTeam(organizationId, teamId);
}

export async function updateTeamMember(
  organizationId: string,
  teamId: string,
  memberId: string,
  input: TeamMemberInput,
  ctx?: Ctx,
): Promise<TeamDTO> {
  const member = await prisma.intakeTeamMember.findFirst({
    where: { id: memberId, teamId, team: { organizationId } },
    select: { id: true, capacity: true, active: true, userId: true },
  });
  if (!member) throw new TeamNotFoundError(memberId);

  const data: Record<string, unknown> = {};
  if (input.capacity !== undefined) {
    if (input.capacity < 0) throw new TeamValidationError("capacity cannot be negative");
    data.capacity = input.capacity;
  }
  if (input.active !== undefined) data.active = input.active;

  await prisma.intakeTeamMember.update({ where: { id: memberId }, data });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.member_updated",
    resourceType: "IntakeTeam",
    resourceId: teamId,
    beforeJson: { capacity: member.capacity, active: member.active },
    afterJson: { capacity: data.capacity ?? member.capacity, active: data.active ?? member.active },
    metadata: { memberUserId: member.userId },
  });
  return getTeam(organizationId, teamId);
}

export async function removeTeamMember(
  organizationId: string,
  teamId: string,
  memberId: string,
  ctx?: Ctx,
): Promise<TeamDTO> {
  const member = await prisma.intakeTeamMember.findFirst({
    where: { id: memberId, teamId, team: { organizationId } },
    select: { id: true, userId: true },
  });
  if (!member) throw new TeamNotFoundError(memberId);

  await prisma.intakeTeamMember.delete({ where: { id: memberId } });

  const actor = await getCurrentUser(ctx?.req, ctx?.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.team.member_removed",
    resourceType: "IntakeTeam",
    resourceId: teamId,
    beforeJson: { userId: member.userId },
  });
  return getTeam(organizationId, teamId);
}

// ── Pool resolver (used by the routing chokepoint) ───────────────────

export interface PoolResolver {
  /** Resolve a route-to-pool action to a concrete member. */
  resolve: (teamId: string) => PoolPick | null;
  /** Bump the round-robin cursor after a pick lands on a member. */
  picked: string[];
}

/**
 * Build a resolver over every pool in the org, with each member's live
 * open-ticket load pre-computed in one grouped query. The returned
 * `resolve` is a synchronous pure lookup (so it slots into the pure
 * `evaluateRoutingRules`); the chokepoint calls `commitPoolPicks`
 * afterward to advance the round-robin cursors for whoever was chosen.
 */
export async function buildPoolResolver(
  organizationId: string,
): Promise<{
  resolve: (teamId: string) => PoolPick | null;
  commitPicks: () => Promise<void>;
}> {
  const teams = await prisma.intakeTeam.findMany({
    where: { organizationId, active: true },
    select: {
      id: true,
      name: true,
      key: true,
      strategy: true,
      overflowTeamId: true,
      members: {
        where: { active: true },
        select: { id: true, userId: true, capacity: true, lastAssignedAt: true },
      },
    },
  });

  // Live open-ticket load per assignee, grouped in one query.
  const loadRows = await prisma.intakeTicket.groupBy({
    by: ["assignedToUserId"],
    where: {
      organizationId,
      assignedToUserId: { not: null },
      status: { in: OPEN_TICKET_STATUSES },
    },
    _count: { _all: true },
  });
  const loadByUser = new Map<string, number>();
  for (const r of loadRows) {
    if (r.assignedToUserId) loadByUser.set(r.assignedToUserId, r._count._all);
  }

  // Resolve display names for members once.
  const memberUserIds = Array.from(
    new Set(teams.flatMap((t) => t.members.map((m) => m.userId))),
  );
  const users = memberUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameByUser = new Map(users.map((u) => [u.id, u.name]));

  // Map (teamId, userId) → member row id so the round-robin cursor
  // update targets the exact membership that was picked.
  const memberIdByKey = new Map<string, string>();
  for (const t of teams) {
    for (const m of t.members) memberIdByKey.set(`${t.id}:${m.userId}`, m.id);
  }

  const poolsById = new Map<string, PoolLike>(
    teams.map((t) => [
      t.id,
      {
        id: t.id,
        key: t.key,
        name: t.name,
        strategy: t.strategy,
        overflowTeamId: t.overflowTeamId,
        members: t.members.map((m) => ({
          userId: m.userId,
          userName: nameByUser.get(m.userId) ?? null,
          capacity: m.capacity,
          openCount: loadByUser.get(m.userId) ?? 0,
          active: true,
          lastAssignedAt: m.lastAssignedAt?.toISOString() ?? null,
        })),
      } satisfies PoolLike,
    ]),
  );

  const pickedMemberIds: string[] = [];
  const resolve = (teamId: string): PoolPick | null => {
    if (!poolsById.has(teamId)) return null;
    const pick = selectFromPool(teamId, poolsById);
    if (pick.userId) {
      const memberId = memberIdByKey.get(`${pick.teamId}:${pick.userId}`);
      if (memberId) pickedMemberIds.push(memberId);
      // Optimistically reflect the pick in the in-memory load so two
      // rules firing in the same pass don't both land on one member.
      const pool = poolsById.get(pick.teamId);
      const m = pool?.members.find((x) => x.userId === pick.userId);
      if (m) {
        m.openCount += 1;
        m.lastAssignedAt = new Date().toISOString();
      }
    }
    return pick;
  };

  const commitPicks = async (): Promise<void> => {
    if (pickedMemberIds.length === 0) return;
    // Advance the round-robin cursor for every membership that was picked.
    await prisma.intakeTeamMember.updateMany({
      where: { id: { in: Array.from(new Set(pickedMemberIds)) } },
      data: { lastAssignedAt: new Date() },
    });
  };

  return { resolve, commitPicks };
}
