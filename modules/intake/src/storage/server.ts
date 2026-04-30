/**
 * Server-side storage layer for the Intake module.
 *
 * Replaces the v8 demo's localStorage-backed key/value store with
 * Prisma queries. The browser polyfill (storage/polyfill.js) calls
 * `/api/intake/storage` which delegates here. The interface — string
 * keys + JSON-stringified values — is preserved so React components
 * don't change. Step 5 will swap them for proper typed queries.
 *
 * Key mapping:
 *   aegis:tickets:v1                IntakeTicket + AgentRecommendation
 *                                   + IntakeConversation rows
 *                                   denormalised back into the v8 shape.
 *   aegis:tickets:seeded            no-op — DB is seeded server-side.
 *   aegis:intake:conversations:v1   IntakeConversation rows grouped by
 *                                   ticketId.
 *   aegis:intake:agent-log:v1       AuditLog rows for intake.* actions
 *                                   shaped back into the v8 log entry.
 *   aegis:intake:agent-settings:v1  UserPreference (key + value).
 *   aegis:intake:cockpit-state:v1   UserPreference (key + value).
 *
 * Server-only — do not import this from a client component. Importing
 * `@aegis/db` in a browser bundle fails at build time, which is exactly
 * the boundary we want.
 */

import {
  prisma,
  logAudit,
  getCurrentOrganization,
  getCurrentUser,
  IntakeSource,
  IntakeStatus,
  AgentRecommendationStatus,
  ConversationRole,
} from "@aegis/db";

// ── Storage keys (mirror modules/intake/src/storage/keys.js) ─────────
const K_TICKETS = "aegis:tickets:v1";
const K_TICKETS_SEEDED = "aegis:tickets:seeded";
const K_CONVERSATIONS = "aegis:intake:conversations:v1";
const K_AGENT_LOG = "aegis:intake:agent-log:v1";
const K_AGENT_SETTINGS = "aegis:intake:agent-settings:v1";
const K_COCKPIT_STATE = "aegis:intake:cockpit-state:v1";

// ── Status mapping helpers (DB enums ⇄ v8 demo strings) ──────────────

const STATUS_TO_V8: Record<string, string> = {
  AWAITING_TRIAGE: "Awaiting Triage",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Triage — Rejected by Attorney",
  ESCALATED: "Escalated to GC",
  CLOSED: "Auto-Completed",
};

function v8StatusToEnum(raw: string | undefined): IntakeStatus {
  if (!raw) return IntakeStatus.AWAITING_TRIAGE;
  const s = raw.toLowerCase();
  if (s.includes("escalat")) return IntakeStatus.ESCALATED;
  if (s.includes("approved") || s === "approved") return IntakeStatus.APPROVED;
  if (s.includes("reject")) return IntakeStatus.REJECTED;
  if (s.includes("complete") || s.includes("auto") || s === "completed")
    return IntakeStatus.CLOSED;
  if (s.includes("review") || s.includes("assigned") || s.includes("snooze"))
    return IntakeStatus.IN_REVIEW;
  return IntakeStatus.AWAITING_TRIAGE;
}

function v8SourceToEnum(raw: string | undefined): IntakeSource {
  if (raw === "copilot") return IntakeSource.COPILOT;
  if (raw === "email") return IntakeSource.EMAIL;
  if (raw === "slack") return IntakeSource.SLACK;
  if (raw === "api") return IntakeSource.API;
  return IntakeSource.FORM;
}

function v8RoleToEnum(raw: string): ConversationRole {
  if (raw === "user") return ConversationRole.USER;
  if (raw === "system") return ConversationRole.SYSTEM;
  return ConversationRole.ASSISTANT;
}

// ── v8 ticket shape (mirrors modules/intake/src/storage/tickets.js) ──

type V8Ticket = {
  id: string;
  _source?: string;
  from?: string;
  dept?: string;
  type?: string;
  priority?: string;
  status?: string;
  stage?: string;
  desc?: string;
  assigned?: string;
  sla?: string;
  slaHours?: number;
  slaStatus?: string;
  submitted?: string;
  submittedTs?: number;
  workflow?: unknown;
  aiTriage?: unknown;
  agentRecommendation?: {
    agentId?: string;
    confidence?: number;
    suggestedAction?: string;
    draftedResponse?: string;
    reasoning?: string;
    concerns?: unknown;
    precedentLinks?: unknown;
    alternativeTone?: string | null;
  } | null;
  conversation?: Array<{
    role: string;
    content: string;
    ts?: number;
    fieldsExtracted?: unknown;
  }>;
  triagedBy?: string | null;
  triagedAt?: number | null;
  triagedAction?: string | null;
  agentProcessedAt?: number | null;
};

// ── Read path: assemble v8 ticket array from DB rows ─────────────────

async function loadTicketsV8(orgId: string): Promise<V8Ticket[]> {
  const rows = await prisma.intakeTicket.findMany({
    where: { organizationId: orgId },
    include: {
      requester: true,
      recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
      conversation: { orderBy: { timestamp: "asc" } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return rows.map((t): V8Ticket => {
    const rec = t.recommendations[0];
    const v8Status = STATUS_TO_V8[t.status] ?? t.status;
    return {
      id: t.id,
      _source: t.source.toLowerCase(),
      from: t.requester?.name ?? "Unknown",
      dept: t.department ?? (t.requester?.metadata as { department?: string })?.department ?? "",
      type: t.type,
      priority: t.priority,
      status: v8Status,
      stage: t.stage,
      desc: t.description,
      assigned: t.assignedTo ?? "Cockpit Queue",
      sla: `${t.slaHours} hrs`,
      slaHours: t.slaHours,
      slaStatus: t.slaStatus,
      submitted: t.submittedAt.toISOString(),
      submittedTs: t.submittedAt.getTime(),
      workflow: (t.workflowJson as unknown) ?? [],
      aiTriage: (t.aiTriageJson as unknown) ?? null,
      agentRecommendation: rec
        ? {
            agentId: rec.agentId,
            confidence: rec.confidence,
            suggestedAction: rec.suggestedAction,
            draftedResponse: rec.draftedResponse,
            reasoning: rec.reasoning,
            concerns: rec.concerns as unknown,
            precedentLinks: rec.citations as unknown,
            alternativeTone: rec.shortFormReply,
          }
        : null,
      conversation: t.conversation.length
        ? t.conversation.map((m) => ({
            role: m.role.toLowerCase(),
            content: m.content,
            ts: m.timestamp.getTime(),
            fieldsExtracted: m.fieldsExtracted as unknown,
          }))
        : undefined,
      triagedBy: t.triagedBy,
      triagedAt: t.triagedAt?.getTime() ?? null,
      triagedAction: t.triagedAction,
      agentProcessedAt: t.agentProcessedAt?.getTime() ?? null,
    };
  });
}

// ── Write path: upsert tickets from a v8 array ───────────────────────

async function saveTicketsV8(
  orgId: string,
  tickets: V8Ticket[],
  ctx?: { req?: { headers: Record<string, string | string[] | undefined> }; res?: unknown },
): Promise<void> {
  // Resolve the actor once — every audit row carries this user's id.
  // Goes through @aegis/auth/server when a request is present, so a
  // real Auth0 session correctly attributes the audit; otherwise
  // falls through to the seeded demo user.
  const demoUser = await getCurrentUser(ctx?.req, ctx?.res);

  for (const t of tickets) {
    if (!t.id) continue;
    const submittedAt = t.submittedTs
      ? new Date(t.submittedTs)
      : new Date();

    // Read pre-mutation state so we can emit an AuditLog row for any
    // transition that crosses a meaningful boundary (Differentiator #3).
    const before = await prisma.intakeTicket.findUnique({
      where: { id: t.id },
      select: {
        status: true,
        triagedAction: true,
        triagedBy: true,
      },
    });

    // Common fields written on both create and update. Plain object so
    // it composes into both Prisma input shapes (update / unchecked create).
    const common = {
      type: t.type ?? "",
      priority: t.priority ?? "Medium",
      status: v8StatusToEnum(t.status),
      stage: t.stage ?? "new",
      description: t.desc ?? "",
      slaHours: t.slaHours ?? 24,
      slaStatus: t.slaStatus ?? "On Track",
      assignedTo: t.assigned ?? null,
      department: t.dept ?? null,
      aiTriageJson: (t.aiTriage ?? null) as never,
      workflowJson: (t.workflow ?? []) as never,
      triagedBy: t.triagedBy ?? null,
      triagedAt: t.triagedAt ? new Date(t.triagedAt) : null,
      triagedAction: t.triagedAction ?? null,
      agentProcessedAt: t.agentProcessedAt ? new Date(t.agentProcessedAt) : null,
    };

    // Resolve requester. If the ticket is brand-new (came from Copilot),
    // we may not have a Person row — fall back to a deterministic auto
    // person matching the seed's "p-auto-…" pattern.
    const fromName = t.from ?? "Unknown";
    const dept = t.dept ?? "";
    let requesterId = (
      await prisma.person.findFirst({
        where: { organizationId: orgId, name: fromName },
        select: { id: true },
      })
    )?.id;
    if (!requesterId) {
      const autoId = "p-auto-" + fromName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const created = await prisma.person.upsert({
        where: { id: autoId },
        update: { name: fromName },
        create: {
          id: autoId,
          organizationId: orgId,
          type: "EMPLOYEE",
          externalRef: "employee:" + autoId,
          name: fromName,
          email: autoId + "@aegis-demo.example",
          metadata: { department: dept, autoCreatedByPolyfill: true },
        },
      });
      requesterId = created.id;
    }

    await prisma.intakeTicket.upsert({
      where: { id: t.id },
      update: common,
      create: {
        ...common,
        id: t.id,
        organizationId: orgId,
        requesterId,
        source: v8SourceToEnum(t._source),
        submittedAt,
      },
    });

    // ── AuditLog discipline ──────────────────────────────────────────
    // Differentiator #3: every state-changing path writes an AuditLog
    // row. The Intake module's transitions of interest, with their
    // canonical action names:
    //
    //   intake.ticket.created                 — first time we see this id
    //   intake.recommendation.approved        — triagedAction → approved
    //   intake.recommendation.edited_approved — triagedAction → edited-approved
    //   intake.recommendation.rejected        — triagedAction → rejected
    //   intake.recommendation.reassigned      — triagedAction → reassigned
    //   intake.ticket.escalated               — status → ESCALATED
    //   intake.ticket.closed                  — status → CLOSED
    //
    // These ride alongside the v8 demo's existing client-side log so the
    // canonical AuditLog ledger fills in without UI changes. The legacy
    // localStorage agent log is silently no-op'd in intakeStorageSet.
    const newStatus = common.status;
    const newAction = common.triagedAction;
    const actor = demoUser.id;

    if (!before) {
      // Brand-new ticket.
      await logAudit({
        organizationId: orgId,
        actorId: actor,
        actorType: "USER",
        action: "intake.ticket.created",
        resourceType: "IntakeTicket",
        resourceId: t.id,
        afterJson: { status: newStatus, source: t._source ?? "form" },
      });
    } else {
      // Status transitions that cross a meaningful boundary.
      if (before.status !== newStatus && newStatus === IntakeStatus.ESCALATED) {
        await logAudit({
          organizationId: orgId,
          actorId: actor,
          actorType: "USER",
          action: "intake.ticket.escalated",
          resourceType: "IntakeTicket",
          resourceId: t.id,
          beforeJson: { status: before.status },
          afterJson: { status: newStatus },
        });
      }
      if (before.status !== newStatus && newStatus === IntakeStatus.CLOSED) {
        await logAudit({
          organizationId: orgId,
          actorId: actor,
          actorType: "USER",
          action: "intake.ticket.closed",
          resourceType: "IntakeTicket",
          resourceId: t.id,
          beforeJson: { status: before.status },
          afterJson: { status: newStatus, triagedAction: newAction },
        });
      }
      // Recommendation review actions — only fire when triagedAction
      // newly transitions (not on every save).
      if (before.triagedAction !== newAction && newAction) {
        const actionMap: Record<string, string> = {
          approved: "intake.recommendation.approved",
          "edited-approved": "intake.recommendation.edited_approved",
          rejected: "intake.recommendation.rejected",
          reassigned: "intake.recommendation.reassigned",
          "manual-close": "intake.recommendation.manual_close",
          snoozed: "intake.recommendation.snoozed",
        };
        const auditAction = actionMap[newAction];
        if (auditAction) {
          await logAudit({
            organizationId: orgId,
            actorId: actor,
            actorType: "USER",
            action: auditAction,
            resourceType: "IntakeTicket",
            resourceId: t.id,
            beforeJson: { triagedAction: before.triagedAction },
            afterJson: {
              triagedAction: newAction,
              triagedBy: t.triagedBy,
            },
            metadata: { source: "intake-storage-api" },
          });
        }
      }
    }

    // Replace recommendation if present.
    if (t.agentRecommendation && t.agentRecommendation.agentId) {
      const r = t.agentRecommendation;
      // Map the ticket's triagedAction onto the rec's review status —
      // approved/edited → APPROVED, rejected → REJECTED, otherwise PENDING.
      const recStatus =
        newAction === "approved" || newAction === "edited-approved"
          ? AgentRecommendationStatus.APPROVED
          : newAction === "rejected"
            ? AgentRecommendationStatus.REJECTED
            : AgentRecommendationStatus.PENDING;
      await prisma.agentRecommendation.deleteMany({ where: { ticketId: t.id } });
      await prisma.agentRecommendation.create({
        data: {
          ticketId: t.id,
          agentId: r.agentId ?? "unknown-agent",
          confidence: r.confidence ?? 0,
          suggestedAction: r.suggestedAction ?? "review",
          draftedResponse: r.draftedResponse ?? "",
          reasoning: r.reasoning ?? "",
          concerns: (r.concerns ?? []) as never,
          citations: (r.precedentLinks ?? []) as never,
          shortFormReply: r.alternativeTone ?? null,
          status: recStatus,
          reviewedBy: recStatus === AgentRecommendationStatus.PENDING ? null : actor,
          reviewedAt: recStatus === AgentRecommendationStatus.PENDING ? null : new Date(),
        },
      });
    }

    // Replace conversation if present.
    if (Array.isArray(t.conversation) && t.conversation.length) {
      await prisma.intakeConversation.deleteMany({ where: { ticketId: t.id } });
      for (const m of t.conversation) {
        await prisma.intakeConversation.create({
          data: {
            ticketId: t.id,
            role: v8RoleToEnum(m.role),
            content: m.content,
            fieldsExtracted: (m.fieldsExtracted ?? null) as never,
            timestamp: new Date(m.ts ?? Date.now()),
          },
        });
      }
    }
  }
}

// ── User-preference KV (cockpit state, agent settings, agent log) ────

async function userPrefGet(userId: string, key: string): Promise<unknown | null> {
  const row = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key } },
  });
  return row?.value ?? null;
}

async function userPrefSet(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    update: { value: (value ?? null) as never },
    create: { userId, key, value: (value ?? null) as never },
  });
}

async function userPrefDelete(userId: string, key: string): Promise<void> {
  await prisma.userPreference.deleteMany({ where: { userId, key } });
}

// ── Agent log: aggregate from AuditLog ───────────────────────────────

async function loadAgentLogV8(orgId: string): Promise<unknown[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: orgId,
      action: { startsWith: "intake." },
    },
    orderBy: { timestamp: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    type: r.action.replace(/^intake\./, ""),
    ticketId: r.resourceType === "IntakeTicket" ? r.resourceId : undefined,
    attorney: r.actorType === "USER" ? "You (Alex Nguyen)" : null,
    timestamp: r.timestamp.getTime(),
    ...((r.metadata as Record<string, unknown>) ?? {}),
  }));
}

// ── Public surface ───────────────────────────────────────────────────

/**
 * Minimal request shape — accepts NextApiRequest or any object with
 * a `headers` field. Threaded into @aegis/db's context helpers, which
 * lazy-load @aegis/auth/server when present (Auth0 session resolution
 * + dev fallback). Without `req`, the helpers fall back to the seeded
 * demo user — useful for scripts that have no HTTP context.
 */
export type RequestContext = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

/**
 * Resolve a `{value: string} | null` payload for the given storage key.
 * Mirrors `window.storage.get(key)` from the v8 demo.
 */
export async function intakeStorageGet(
  key: string,
  ctx: RequestContext = {},
): Promise<{ value: string } | null> {
  const org = await getCurrentOrganization(ctx.req, ctx.res);
  const user = await getCurrentUser(ctx.req, ctx.res);

  if (key === K_TICKETS) {
    const tickets = await loadTicketsV8(org.id);
    return { value: JSON.stringify(tickets) };
  }
  if (key === K_TICKETS_SEEDED) {
    // The DB is always seeded server-side now.
    return { value: JSON.stringify(true) };
  }
  if (key === K_CONVERSATIONS) {
    // Reconstructed from IntakeConversation grouped by ticketId.
    const rows = await prisma.intakeConversation.findMany({
      where: { ticket: { organizationId: org.id } },
      orderBy: { timestamp: "asc" },
    });
    const grouped: Record<string, unknown[]> = {};
    for (const m of rows) {
      (grouped[m.ticketId] ??= []).push({
        role: m.role.toLowerCase(),
        content: m.content,
        ts: m.timestamp.getTime(),
      });
    }
    return { value: JSON.stringify(grouped) };
  }
  if (key === K_AGENT_LOG) {
    return { value: JSON.stringify(await loadAgentLogV8(org.id)) };
  }
  if (key === K_AGENT_SETTINGS || key === K_COCKPIT_STATE) {
    const v = await userPrefGet(user.id, key);
    if (v == null) return null;
    return { value: JSON.stringify(v) };
  }
  // Unknown key — KV fallback under the user's preferences.
  const v = await userPrefGet(user.id, key);
  if (v == null) return null;
  return { value: JSON.stringify(v) };
}

/**
 * Persist a JSON-stringified value. Mirrors `window.storage.set(key, value)`.
 * `value` arrives as a string (the v8 store calls JSON.stringify before the
 * polyfill ever sees it).
 */
export async function intakeStorageSet(
  key: string,
  value: string,
  ctx: RequestContext = {},
): Promise<void> {
  const org = await getCurrentOrganization(ctx.req, ctx.res);
  const user = await getCurrentUser(ctx.req, ctx.res);

  if (key === K_TICKETS) {
    let parsed: V8Ticket[];
    try {
      parsed = JSON.parse(value) as V8Ticket[];
    } catch {
      throw new Error("[intake/storage] tickets payload is not valid JSON");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("[intake/storage] tickets payload must be an array");
    }
    await saveTicketsV8(org.id, parsed, ctx);
    return;
  }
  if (key === K_TICKETS_SEEDED) {
    // No-op — DB is always seeded server-side.
    return;
  }
  if (key === K_AGENT_LOG) {
    // No-op on direct writes — the canonical audit trail is AuditLog,
    // populated by logAudit() calls inside the mutation paths. Direct
    // writes from the client used to append to the localStorage array;
    // we ignore them silently to avoid double-logging.
    return;
  }
  if (
    key === K_CONVERSATIONS ||
    key === K_AGENT_SETTINGS ||
    key === K_COCKPIT_STATE
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`[intake/storage] ${key} payload is not valid JSON`);
    }
    await userPrefSet(user.id, key, parsed);
    return;
  }
  // Unknown key — KV fallback.
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }
  await userPrefSet(user.id, key, parsed);
}

/**
 * Delete the value for a key. Mirrors `window.storage.delete(key)`.
 */
export async function intakeStorageDelete(
  key: string,
  ctx: RequestContext = {},
): Promise<void> {
  const org = await getCurrentOrganization(ctx.req, ctx.res);
  const user = await getCurrentUser(ctx.req, ctx.res);

  if (key === K_TICKETS) {
    // Reset path — drop tickets, recommendations, conversations.
    // Used by the Cockpit's "Reset to seed" action; the next read
    // returns the freshly-seeded set.
    await prisma.intakeConversation.deleteMany({
      where: { ticket: { organizationId: org.id } },
    });
    await prisma.agentRecommendation.deleteMany({
      where: { ticket: { organizationId: org.id } },
    });
    await prisma.intakeTicket.deleteMany({ where: { organizationId: org.id } });
    return;
  }
  if (key === K_TICKETS_SEEDED || key === K_AGENT_LOG) {
    // No-op — managed server-side.
    return;
  }
  await userPrefDelete(user.id, key);
}
