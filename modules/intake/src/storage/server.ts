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
import { evaluateRoutingRules } from "../routing/rules";
import { loadEnabledRoutingRules, recordRuleFirings } from "../routing/server";
import { buildPoolResolver } from "../routing/teams";
import { deriveComplexity } from "../routing/complexity";
import { maybeSpawnMatterForApprovedTicket } from "../matter-spawn/server";
import { syncAgentDecisionForTicket } from "../agent-decision/server";
import { buildAutoBatonRows } from "../handoff/auto";

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
  /** Phase 1b — typed assignee FK. Coexists with `assigned` free-text. */
  assignedToUserId?: string | null;
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
  /** Item-1 wiring — the configured IntakeRequestType this ticket was
   *  filed under (null for the built-in hardcoded types). */
  requestTypeId?: string | null;
  /**
   * P2b — agent routing outcome the client stamps after running the
   * router: "matched" | "no-match". Drives the
   * `intake.ticket.agent_no_match` audit row. Not persisted as a
   * column; used only to emit the audit on the first-processing
   * transition.
   */
  agentOutcome?: string | null;
  /**
   * P2a — which routing rules fired (server-computed; read-only for
   * the client). Shape: { ruleIds, firedAt, summaries }. Anything the
   * client sends back here is ignored on write.
   */
  firedRules?: unknown;
  /**
   * P2b — when set, this ticket has already spawned a Matter and is
   * linked to it. Read-only from the client's perspective; written
   * server-side by the matter-spawn helper on first approval.
   */
  matterId?: string | null;
  /**
   * Item 6 / W2-2 — denormalized baton holder ("agent" | "human" |
   * "queue") and the concrete person when human. Read-only for the
   * client; written by the hand-off endpoint and the auto baton-pass.
   */
  handoffHolder?: string | null;
  handoffUserId?: string | null;
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
      assignedToUserId: t.assignedToUserId,
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
      firedRules: (t.firedRulesJson as unknown) ?? null,
      matterId: t.matterId ?? null,
      requestTypeId: t.requestTypeId ?? null,
      handoffHolder: t.handoffHolder ?? null,
      handoffUserId: t.handoffUserId ?? null,
    };
  });
}

// ── Write path: upsert tickets from a v8 array ───────────────────────

/**
 * Side effects that happened inside the save, returned so the HTTP
 * caller can surface them to the UI (toast, matter link, etc.).
 */
export interface SaveTicketsV8Result {
  spawnedMatters: Array<{
    ticketId: string;
    matterId: string;
    matterNumber: string | null;
    matterTitle: string;
  }>;
}

async function saveTicketsV8(
  orgId: string,
  tickets: V8Ticket[],
  ctx?: { req?: { headers: Record<string, string | string[] | undefined> }; res?: unknown },
): Promise<SaveTicketsV8Result> {
  const spawnedMatters: SaveTicketsV8Result["spawnedMatters"] = [];
  // Resolve the actor once — every audit row carries this user's id.
  // Goes through @aegis/auth/server when a request is present, so a
  // real Auth0 session correctly attributes the audit; otherwise
  // falls through to the seeded demo user.
  const demoUser = await getCurrentUser(ctx?.req, ctx?.res);

  // P2a — enabled routing rules, loaded once per save. Rules evaluate
  // for every untriaged ticket on every save (idempotent: deterministic
  // conditions reconverge the rule-set fields even if a stale client
  // payload overwrote them), but audit + counters fire only on the
  // first firing of each rule per ticket.
  const routingRules = await loadEnabledRoutingRules(orgId);

  // Item 5 (tiering) — if any enabled rule routes to a pool, build the
  // load-balancing resolver once per save. `resolve` is a pure sync
  // lookup passed into the evaluator; `commitPicks` advances the
  // round-robin cursors after all tickets are evaluated.
  const hasPoolRules = routingRules.some((r) => !!r.setTeamId);
  const poolResolver = hasPoolRules ? await buildPoolResolver(orgId) : null;

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
        stage: true,
        triagedAction: true,
        triagedBy: true,
        assignedToUserId: true,
        firedRulesJson: true,
        matterId: true,
        agentProcessedAt: true,
        requestTypeId: true,
        stageTimestampsJson: true,
        handoffHolder: true,
        handoffUserId: true,
      },
    });

    // Authoritative triage attribution (Phase 1a).
    //
    // `triagedBy` used to be whatever string the client sent — the demo
    // hardcoded "You (Alex Nguyen)". Now, whenever a triage action is
    // newly transitioning (before.triagedAction !== incoming action,
    // and the new action is non-null), we overwrite `triagedBy` with
    // the Auth0-resolved User.name. This makes the persisted display
    // name match the audit row's actorId — no client-side spoofing
    // path. When no transition is happening, the prior value is
    // preserved verbatim.
    const incomingAction = t.triagedAction ?? null;
    const isNewTriageTransition =
      !!incomingAction && before?.triagedAction !== incomingAction;
    const authoritativeTriagedBy = isNewTriageTransition
      ? demoUser.name
      : (before?.triagedBy ?? t.triagedBy ?? null);

    // Common fields written on both create and update. Plain object so
    // it composes into both Prisma input shapes (update / unchecked create).
    // Phase 1b — `assignedToUserId` is the typed FK; `assignedTo` (free
    // text) coexists during migration. Both update from the same client
    // payload; audit rows fire on FK transitions, not free-text edits.
    const incomingAssignedToUserId =
      t.assignedToUserId !== undefined
        ? t.assignedToUserId
        : (before?.assignedToUserId ?? null);
    const common = {
      type: t.type ?? "",
      priority: t.priority ?? "Medium",
      status: v8StatusToEnum(t.status),
      stage: t.stage ?? "new",
      description: t.desc ?? "",
      slaHours: t.slaHours ?? 24,
      slaStatus: t.slaStatus ?? "On Track",
      assignedTo: t.assigned ?? null,
      assignedToUserId: incomingAssignedToUserId,
      department: t.dept ?? null,
      aiTriageJson: (t.aiTriage ?? null) as never,
      workflowJson: (t.workflow ?? []) as never,
      triagedBy: authoritativeTriagedBy,
      triagedAt: t.triagedAt ? new Date(t.triagedAt) : null,
      triagedAction: incomingAction,
      agentProcessedAt: t.agentProcessedAt ? new Date(t.agentProcessedAt) : null,
      // Item-1 wiring — configured request type. Undefined preserves the
      // stored value (stale clients that don't send the field can't
      // clear it); null/value writes through.
      requestTypeId:
        t.requestTypeId !== undefined
          ? t.requestTypeId
          : (before?.requestTypeId ?? null),
      // Server-owned (W1-5 advance endpoint writes it); preserve.
      stageTimestampsJson: (before?.stageTimestampsJson ?? null) as never,
      // Server-computed below; the client's copy is never trusted.
      firedRulesJson: (before?.firedRulesJson ?? null) as never,
    };

    // ── P2a — routing rules (untriaged tickets only) ─────────────────
    // An attorney's triage action always wins: once any triage action
    // exists, rules stop touching the ticket. Evaluation runs over the
    // post-client values so a stale optimistic write reconverges to
    // the rule outcome instead of clobbering it.
    const priorFired = (before?.firedRulesJson ?? null) as {
      ruleIds?: string[];
      summaries?: Array<{ id: string; name: string; actions: string[] }>;
    } | null;
    let newlyFired: Array<{ id: string; name: string; actions: string[] }> = [];
    // W2-1 — derive the complexity band from the triage signal, stamp
    // it onto aiTriage for display, and feed it to the rule engine.
    const triageSignal = (t.aiTriage ?? null) as {
      riskFlag?: string; confidence?: number; estimatedHours?: number; complexity?: string;
    } | null;
    const complexity = deriveComplexity(triageSignal);
    if (triageSignal && triageSignal.complexity !== complexity) {
      common.aiTriageJson = { ...triageSignal, complexity } as never;
    }
    if (!incomingAction && !authoritativeTriagedBy && routingRules.length > 0) {
      const { patch, fired } = evaluateRoutingRules(
        routingRules,
        {
          type: common.type,
          priority: common.priority,
          department: common.department,
          description: common.description,
          slaHours: common.slaHours,
          assignedToUserId: common.assignedToUserId,
          complexity,
        },
        poolResolver ? { resolvePool: poolResolver.resolve } : {},
      );
      if (fired.length > 0) {
        if (patch.priority !== undefined) common.priority = patch.priority;
        if (patch.slaHours !== undefined) common.slaHours = patch.slaHours;
        if (patch.assignedToUserId !== undefined)
          common.assignedToUserId = patch.assignedToUserId;
        if (patch.assignedTo !== undefined) common.assignedTo = patch.assignedTo;
        const priorIds = new Set(priorFired?.ruleIds ?? []);
        newlyFired = fired.filter((f) => !priorIds.has(f.id));
        common.firedRulesJson = {
          ruleIds: fired.map((f) => f.id),
          firedAt: new Date().toISOString(),
          summaries: fired,
        } as never;
      }
    }

    // Resolve requester (Phase 1a — session-authoritative).
    //
    // Resolution order, most specific first:
    //   1. The session user's Person row (`Person.userId === demoUser.id`).
    //      Canonical — the User row is the source of truth and `Person.userId`
    //      is the FK linking the two. A logged-in user filing a ticket should
    //      always attribute to their own Person.
    //   2. Name match within the org (legacy demo path — fixtures and
    //      back-compat with the v8 hardcoded "Alex Nguyen" data).
    //   3. Auto-create a `p-auto-...` Person (last-resort fallback so a
    //      brand-new requester from Copilot doesn't fail the upsert).
    //
    // Note: this only runs for brand-new tickets (the v8 polyfill never
    // changes the requester on an existing one — see storage/keys.js).
    const fromName = t.from ?? "Unknown";
    const dept = t.dept ?? "";
    let requesterId: string | undefined;
    if (demoUser.id) {
      const ownPerson = await prisma.person.findFirst({
        where: { organizationId: orgId, userId: demoUser.id },
        select: { id: true },
      });
      requesterId = ownPerson?.id;
    }
    if (!requesterId) {
      requesterId = (
        await prisma.person.findFirst({
          where: { organizationId: orgId, name: fromName },
          select: { id: true },
        })
      )?.id;
    }
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
    //   intake.ticket.assigned                 — assignedToUserId changed (P1b)
    //   intake.ticket.stage_advanced           — stage changed (P1b)
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
      // Phase 1b — assignment transitions (typed FK only; free-text
      // edits don't fire the audit because they aren't a structural
      // ownership change). Compares the FINAL assignee (post-routing-
      // rules) so rule-driven reassignment is captured too; the
      // routing-rule audit row below carries the SYSTEM attribution.
      if (
        (before.assignedToUserId ?? null) !==
        (common.assignedToUserId ?? null)
      ) {
        await logAudit({
          organizationId: orgId,
          actorId: actor,
          actorType: "USER",
          action: "intake.ticket.assigned",
          resourceType: "IntakeTicket",
          resourceId: t.id,
          beforeJson: { assignedToUserId: before.assignedToUserId ?? null },
          afterJson: { assignedToUserId: common.assignedToUserId ?? null },
        });
      }
      // Phase 1b — stage transitions. Stage is the Kanban-column
      // dimension; promoting from "new" → "triage" → "assigned" →
      // "review" → "complete" is a first-class lifecycle event.
      if ((before.stage ?? null) !== (common.stage ?? null)) {
        await logAudit({
          organizationId: orgId,
          actorId: actor,
          actorType: "USER",
          action: "intake.ticket.stage_advanced",
          resourceType: "IntakeTicket",
          resourceId: t.id,
          beforeJson: { stage: before.stage ?? null },
          afterJson: { stage: common.stage ?? null },
        });
      }
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
        let approvalAuditId: string | null = null;
        if (auditAction) {
          approvalAuditId = await logAudit({
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

        // P2b — AgentDecision lifecycle (conservative-AI gate). When a
        // recommendation exists, the attorney's approve/reject keystroke
        // resolves its AgentDecision row — the ONLY path from PENDING to
        // APPROVED. resultingAuditLogId links the verdict to the audit
        // row above. agentActionApproved gates the matter spawn below:
        // a recommendation that isn't APPROVED can't spawn a matter,
        // even if the ticket's flags say otherwise. Tickets with no
        // recommendation (manual / no-agent) are ungated → approved.
        let agentActionApproved = true;
        if (t.agentRecommendation?.agentId) {
          const gate = await syncAgentDecisionForTicket({
            organizationId: orgId,
            ticketId: t.id,
            rec: t.agentRecommendation,
            action: newAction,
            actorId: actor,
            auditLogId: approvalAuditId,
          });
          agentActionApproved = gate.approved;
        }

        // P2b — auto-spawn a Matter when an attorney approves a
        // matter-eligible intake type. Closes the "one brain" loop:
        // intake, matter, documents, and audit all attach to the same
        // shared entities. Idempotent — spawn is skipped if the
        // ticket is already linked. Spawn failures don't roll back
        // the approval (the audit row above is already on the chain);
        // they're logged and surfaced as a separate audit event so
        // the attorney isn't blocked. Gated on the AgentDecision being
        // APPROVED — schema-enforced conservative AI.
        const isApprovalAction =
          newAction === "approved" || newAction === "edited-approved";
        if (isApprovalAction && agentActionApproved) {
          try {
            const spawn = await maybeSpawnMatterForApprovedTicket(
              {
                id: t.id,
                type: common.type,
                description: common.description,
                matterId: before?.matterId ?? null,
                organizationId: orgId,
                requesterName: t.from ?? null,
              },
              demoUser,
            );
            if (spawn) {
              spawnedMatters.push({ ticketId: t.id, ...spawn });
            }
          } catch (err) {
            await logAudit({
              organizationId: orgId,
              actorId: actor,
              actorType: "USER",
              action: "intake.ticket.matter_spawn_failed",
              resourceType: "IntakeTicket",
              resourceId: t.id,
              afterJson: {
                error: err instanceof Error ? err.message : String(err),
                intakeType: common.type,
              },
            });
          }
        }
      }
    }

    // P2a — one chain-sealed audit row per newly-fired routing rule.
    // SYSTEM actor: the rule, not the session user, made the change.
    // Counters feed the SLA Operations effectiveness panel.
    for (const f of newlyFired) {
      await logAudit({
        organizationId: orgId,
        actorId: null,
        actorType: "SYSTEM",
        action: "intake.routing_rule.fired",
        resourceType: "IntakeTicket",
        resourceId: t.id,
        afterJson: { ruleId: f.id, ruleName: f.name, actions: f.actions },
      });
    }
    await recordRuleFirings(newlyFired.map((f) => f.id));

    // P2b — agent no-match audit. Fires once, on the transition where
    // the client-side router first processes the ticket
    // (agentProcessedAt goes null → set) and reports that NO agent
    // claimed it. A chain-sealed SYSTEM row so ops can query which
    // intake patterns fall through to manual triage and need a new
    // agent or KB entry. Deduped by the first-processing transition —
    // re-saves don't re-audit.
    const becameProcessed = !before?.agentProcessedAt && !!common.agentProcessedAt;
    if (becameProcessed && t.agentOutcome === "no-match") {
      await logAudit({
        organizationId: orgId,
        actorId: null,
        actorType: "SYSTEM",
        action: "intake.ticket.agent_no_match",
        resourceType: "IntakeTicket",
        resourceId: t.id,
        afterJson: {
          type: common.type,
          descSnippet: (common.description || "").slice(0, 80),
        },
      });
    }

    // Replace recommendation if present.
    // W2-2 — captured so the auto baton-pass below can link the pass to
    // the governing AgentDecision (one record ties the review gate and
    // the custody hand-off together).
    let pendingDecisionId: string | null = null;
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

      // P2b — every fresh recommendation gets a PENDING AgentDecision
      // row (the evidence record). On a review save the approval block
      // above already resolved it, so this only fires on the agent-runs
      // save (no triage action yet). Idempotent: syncAgentDecision
      // no-ops if a decision already exists.
      if (recStatus === AgentRecommendationStatus.PENDING) {
        const sync = await syncAgentDecisionForTicket({
          organizationId: orgId,
          ticketId: t.id,
          rec: r,
          action: null,
        });
        pendingDecisionId = sync.decision?.id ?? null;
      }
    }

    // W2-2 — auto baton-pass (issue #109). On the same first-processing
    // transition as the no-match audit above, the agent pipeline writes
    // its own chain of custody: (prior → agent) while the agent worked,
    // then (agent → assignee|queue) when the draft landed — or
    // (agent → queue) when no agent matched. Nobody remembers to log
    // it; the ledger populates itself. Deduped by the becameProcessed
    // transition, so re-saves never double-write. AGENT actor rows
    // (actorId null) — the pipeline, not the session user, moved the
    // baton. One summarizing chain-sealed audit row covers both passes.
    if (becameProcessed) {
      const outcome =
        t.agentRecommendation?.agentId ? ("drafted" as const) : ("no-match" as const);
      const plan = buildAutoBatonRows({
        currentHolder: before?.handoffHolder ?? null,
        assignedToUserId: common.assignedToUserId ?? null,
        outcome,
      });
      for (const [i, row] of plan.rows.entries()) {
        await prisma.intakeTicketHandoff.create({
          data: {
            ticketId: t.id,
            fromHolder: row.fromHolder,
            toHolder: row.toHolder,
            toUserId: row.toUserId,
            reason: row.reason,
            actorId: null,
            actorType: "AGENT",
            // The final pass (the one that queues the draft for review)
            // links the governing AgentDecision when one was created.
            agentDecisionId:
              i === plan.rows.length - 1 ? pendingDecisionId : null,
          },
        });
      }
      await prisma.intakeTicket.update({
        where: { id: t.id },
        data: {
          handoffHolder: plan.finalHolder,
          handoffUserId: plan.finalUserId,
          handoffUpdatedAt: new Date(),
        },
      });
      await logAudit({
        organizationId: orgId,
        actorId: null,
        actorType: "AGENT",
        action: "intake.ticket.handoff",
        resourceType: "IntakeTicket",
        resourceId: t.id,
        beforeJson: {
          holder: before?.handoffHolder ?? null,
          holderUserId: before?.handoffUserId ?? null,
        },
        afterJson: {
          holder: plan.finalHolder,
          holderUserId: plan.finalUserId,
        },
        metadata: {
          auto: "agent-pipeline",
          outcome,
          passes: plan.rows.length,
          agentDecisionId: pendingDecisionId,
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
  // Item 5 — advance round-robin cursors for pool members picked this pass.
  if (poolResolver) await poolResolver.commitPicks();
  return { spawnedMatters };
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
  if (rows.length === 0) return [];

  // Phase 1a: batch-resolve real actor display names from User.name.
  // Replaces the demo-era hardcoded "You (Alex Nguyen)" string. The
  // actorId is also exposed on each row so the UI can format "You"
  // vs other users client-side via the session.
  const userIds = Array.from(
    new Set(
      rows
        .filter((r) => r.actorType === "USER" && r.actorId)
        .map((r) => r.actorId as string),
    ),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, organizationId: orgId },
        select: { id: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => {
    let attorney: string | null = null;
    if (r.actorType === "USER" && r.actorId) {
      attorney = userById.get(r.actorId) ?? "Unknown user";
    } else if (r.actorType === "AGENT") {
      attorney = "AEGIS Agent";
    } else if (r.actorType === "SYSTEM") {
      attorney = "System";
    }
    return {
      type: r.action.replace(/^intake\./, ""),
      ticketId: r.resourceType === "IntakeTicket" ? r.resourceId : undefined,
      attorney,
      actorId: r.actorId,
      actorType: r.actorType,
      timestamp: r.timestamp.getTime(),
      ...((r.metadata as Record<string, unknown>) ?? {}),
    };
  });
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
 * Side-effect payload returned to the HTTP caller for the tickets
 * key. Lets the UI surface things that happened server-side (matter
 * spawns, eventually rule firings) without the client polling for
 * them. Other keys return null (no side effects to report).
 */
export interface IntakeStorageSetResult {
  spawnedMatters?: SaveTicketsV8Result["spawnedMatters"];
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
): Promise<IntakeStorageSetResult> {
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
    const result = await saveTicketsV8(org.id, parsed, ctx);
    return {
      spawnedMatters: result.spawnedMatters.length > 0 ? result.spawnedMatters : undefined,
    };
  }
  if (key === K_TICKETS_SEEDED) {
    // No-op — DB is always seeded server-side.
    return {};
  }
  if (key === K_AGENT_LOG) {
    // No-op on direct writes — the canonical audit trail is AuditLog,
    // populated by logAudit() calls inside the mutation paths. Direct
    // writes from the client used to append to the localStorage array;
    // we ignore them silently to avoid double-logging.
    return {};
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
    return {};
  }
  // Unknown key — KV fallback.
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }
  await userPrefSet(user.id, key, parsed);
  return {};
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
