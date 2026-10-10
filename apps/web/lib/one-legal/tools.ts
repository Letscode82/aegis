/**
 * ONE Legal tool registry (OL-2) — the declarative catalog of governed
 * actions the console can execute across the modules.
 *
 * Each tool wraps a module's public `api.ts` function behind a `Permission`.
 * ONE Legal never mutates directly: it *proposes* a tool for a task; the
 * human clicks Approve in the console; only then does `/api/one-legal/act`
 * run the tool, write an `AgentDecision` (the evidence record) and a
 * chain-sealed `AuditLog` row. Args are derived server-side from the request
 * text (never trusted from the client) and re-validated inside the module.
 *
 * Server-only (imports module `api.ts`). apps/web is the composition root, so
 * importing across modules here is allowed.
 *
 * Adding a tool = one entry. This first cut ships `matter.create`
 * (create-only, reversible via the matter close/archive lifecycle). Legal
 * hold, DSAR, contract-draft tools follow the same shape.
 */
import { Permission, type AuthUser } from "@aegis/auth";
import { createMatter, createLegalHold, issueNotice, listNoticeTemplates, type MatterType } from "@aegis/matter";
import { createContract } from "@aegis/contracts";
import { createDsarRequest } from "@aegis/privacy";
import { runAndPersistReview } from "@aegis/spend";
import { persistReviewSet } from "@aegis/review";
import { prisma, logAudit, ReviewSetOrigin } from "@aegis/db";
import { recordGovernedActionTicket } from "@aegis/intake/governed";
import { createHash } from "crypto";
import { assertAndAudit } from "../authz";

export interface OneLegalUser { id: string; organizationId: string }
export interface ToolResult { resourceId: string; resourceLabel: string; label: string; navigate: string }
/** Some tools act ON an existing resource (e.g. a legal hold needs a matter).
 *  When set, the console renders a picker of that kind before Approve, and
 *  passes the chosen id back as `targetId`. */
export interface ToolTarget { kind: "matter" | "invoice" | "hold"; label: string }
export interface OneLegalTool<A> {
  id: string;
  label: string;
  kind: "write" | "read";
  permission: Permission;
  resourceType: string;
  needsTarget?: ToolTarget;
  deriveArgs: (text: string, targetId?: string) => A;
  summary: (args: A) => string;
  run: (args: A, user: OneLegalUser) => Promise<ToolResult>;
}

function inferTitle(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  return cap.slice(0, 120);
}

const MATTER_TYPE_RULES: Array<[RegExp, MatterType]> = [
  [/\b(sued|lawsuit|litigat|dispute|claim|subpoena|demand letter)\b/i, "LITIGATION"],
  [/\b(harass|discriminat|termination|employee|employment|wrongful)\b/i, "EMPLOYMENT"],
  [/\b(patent|trademark|copyright|\bip\b|inventorship|open.?source)\b/i, "IP"],
  [/\b(merger|acquisition|m&a|divestiture)\b/i, "MA"],
  [/\b(investigat|whistleblow|misconduct)\b/i, "INVESTIGATION"],
  [/\b(regulat|compliance|sanction)\b/i, "REGULATORY"],
  [/\b(contract|vendor|msa|nda|transaction|deal|procurement|saas)\b/i, "TRANSACTIONAL"],
];
function inferMatterType(text: string): MatterType {
  for (const [re, ty] of MATTER_TYPE_RULES) if (re.test(text)) return ty;
  return "ADVISORY";
}

interface MatterArgs { title: string; type: MatterType }

const matterCreate: OneLegalTool<MatterArgs> = {
  id: "matter.create",
  label: "Open a matter",
  kind: "write",
  permission: Permission.MatterCreate,
  resourceType: "Matter",
  deriveArgs: (text) => ({ title: inferTitle(text), type: inferMatterType(text) }),
  summary: (args) => `Open a ${args.type} matter — "${args.title}"`,
  run: async (args, user) => {
    const m = await createMatter({ title: args.title, type: args.type }, { id: user.id, organizationId: user.organizationId });
    return { resourceId: m.id, resourceLabel: m.matterNumber || m.title || m.id, label: `Matter · ${args.type}`, navigate: "matters" };
  },
};

// Contract type is a free string on the Contract entity ("NDA" | "MSA" | …),
// so there's no enum to violate — infer a sensible label from the request.
function inferContractType(text: string): string {
  const t = text.toLowerCase();
  if (/\bnda\b|non.?disclos|confidential/.test(t)) return "NDA";
  if (/\bmsa\b|master service/.test(t)) return "MSA";
  if (/\bsow\b|statement of work/.test(t)) return "SOW";
  if (/\bdpa\b|data processing/.test(t)) return "DPA";
  if (/licen[cs]/.test(t)) return "License";
  if (/supply|supplier/.test(t)) return "Supply";
  return "Agreement";
}

interface ContractArgs { title: string; type: string }

const contractDraft: OneLegalTool<ContractArgs> = {
  id: "contracts.draft",
  label: "Draft a contract",
  kind: "write",
  permission: Permission.ContractsCreate,
  resourceType: "Contract",
  deriveArgs: (text) => ({ title: inferTitle(text), type: inferContractType(text) }),
  summary: (args) => `Draft a ${args.type} — "${args.title}" (starts in DRAFT)`,
  run: async (args, user) => {
    const c = await createContract(user.organizationId, { title: args.title, type: args.type }, { id: user.id, type: "USER" });
    return { resourceId: c.id, resourceLabel: c.title || c.id, label: `Contract · ${args.type}`, navigate: "contracts" };
  },
};

// DSAR request type is an enum; infer from the request, default to ACCESS.
function inferDsarType(text: string): string {
  const t = text.toLowerCase();
  if (/eras|delet|right to be forgotten|forget/.test(t)) return "ERASURE";
  if (/correct|rectif/.test(t)) return "CORRECTION";
  if (/portab|export my data/.test(t)) return "PORTABILITY";
  if (/\bobject\b/.test(t)) return "OBJECT";
  if (/restrict/.test(t)) return "RESTRICT_PROCESSING";
  return "ACCESS";
}

interface DsarArgs { requestType: string; jurisdiction: string }

const dsarCreate: OneLegalTool<DsarArgs> = {
  id: "privacy.dsar.create",
  label: "File a DSAR",
  kind: "write",
  permission: Permission.PrivacyDsarFulfill,
  resourceType: "DataSubjectRequest",
  deriveArgs: (text) => ({ requestType: inferDsarType(text), jurisdiction: "US" }),
  summary: (args) => `File a ${args.requestType} DSAR (${args.jurisdiction}) — capture the requester's identity in Privacy`,
  run: async (args, user) => {
    const d = await createDsarRequest(
      user.organizationId,
      { requestType: args.requestType as never, jurisdiction: args.jurisdiction, requesterName: "(requester — capture in Privacy)", source: "internal" },
      { id: user.id, type: "USER" },
    );
    return { resourceId: d.id, resourceLabel: d.id, label: `DSAR · ${args.requestType}`, navigate: "privacy" };
  },
};

interface HoldArgs { matterId: string; title: string; scopeDescription: string }

const legalHoldCreate: OneLegalTool<HoldArgs> = {
  id: "matter.legalhold.create",
  label: "Create a legal hold",
  kind: "write",
  permission: Permission.MatterLegalHoldIssue,
  resourceType: "LegalHold",
  needsTarget: { kind: "matter", label: "Matter" },
  deriveArgs: (text, targetId) => ({ matterId: targetId || "", title: inferTitle(text) || "Legal hold", scopeDescription: text.replace(/\s+/g, " ").trim().slice(0, 500) }),
  summary: (args) => `Create a legal hold on the selected matter — "${args.title}" (starts in DRAFT)`,
  run: async (args, user) => {
    const h = await createLegalHold({ matterId: args.matterId, title: args.title, scopeDescription: args.scopeDescription }, { id: user.id, organizationId: user.organizationId });
    return { resourceId: h.id, resourceLabel: h.title || h.id, label: "Legal hold · DRAFT", navigate: "matters" };
  },
};

interface InvoiceArgs { invoiceId: string }

const invoiceReview: OneLegalTool<InvoiceArgs> = {
  id: "spend.invoice.review",
  label: "Run an invoice review",
  kind: "write",
  permission: Permission.SpendReadAll,
  resourceType: "Invoice",
  needsTarget: { kind: "invoice", label: "Invoice" },
  deriveArgs: (_text, targetId) => ({ invoiceId: targetId || "" }),
  summary: () => "Run the AI + deterministic billing-guideline review on the selected invoice",
  run: async (args, user) => {
    await runAndPersistReview(user.organizationId, args.invoiceId, user.id);
    return { resourceId: args.invoiceId, resourceLabel: args.invoiceId, label: "Invoice review", navigate: "spend" };
  },
};

// --- Cross-module demo-spine tools (OL-7) ---------------------------------
// These power the "Acme served us → matter → hold → review → notice" governed
// spine. They act ON a resource produced by an earlier spine step (chained),
// so they are deliberately absent from `selectToolId` — they surface only
// through the spine planner, where the target is supplied by the prior step's
// result rather than a manual picker.

interface ReviewStartArgs { matterId: string; name: string; query: string }

const reviewStart: OneLegalTool<ReviewStartArgs> = {
  id: "matter.review.start",
  label: "Start document review",
  kind: "write",
  permission: Permission.MatterLegalHoldIssue,
  resourceType: "ReviewSet",
  needsTarget: { kind: "matter", label: "Matter" },
  deriveArgs: (text, targetId) => ({
    matterId: targetId || "",
    name: `Review — ${inferTitle(text)}`.slice(0, 120),
    query: text.replace(/\s+/g, " ").trim().slice(0, 500),
  }),
  summary: (args) => `Open a document-review set on the selected matter — "${args.name}" (starts empty, simulated)`,
  run: async (args, user) => {
    const rs = await persistReviewSet(
      user.organizationId,
      { origin: ReviewSetOrigin.LEGAL_HOLD, name: args.name, queryString: args.query, sources: [], matterId: args.matterId, custodianCount: 0, simulated: true },
      [],
      { id: user.id, type: "USER" },
    );
    return { resourceId: rs.id, resourceLabel: rs.name || rs.id, label: "Review set", navigate: "matters" };
  },
};

interface HoldNoticeArgs { holdId: string }

const legalHoldNotice: OneLegalTool<HoldNoticeArgs> = {
  id: "matter.legalhold.notice",
  label: "Issue a hold notice",
  kind: "write",
  permission: Permission.MatterLegalHoldIssue,
  resourceType: "HoldNoticeIssuance",
  needsTarget: { kind: "hold", label: "Legal hold" },
  deriveArgs: (_text, targetId) => ({ holdId: targetId || "" }),
  summary: () => "Issue the legal-hold preservation notice to the hold's custodians (org default template)",
  run: async (args, user) => {
    const templates = await listNoticeTemplates(user.organizationId);
    const tpl = templates.find((t) => t.isActive) || templates[0];
    if (!tpl) throw new Error("No hold notice template is configured for this organization.");
    const issuance = await issueNotice({ holdId: args.holdId, templateId: tpl.id }, { id: user.id, organizationId: user.organizationId });
    return { resourceId: issuance.id, resourceLabel: `Notice ${issuance.id.slice(0, 8)}`, label: "Hold notice", navigate: "matters" };
  },
};

// The registry. Keyed by tool id.
export const TOOLS: Record<string, OneLegalTool<unknown>> = {
  [matterCreate.id]: matterCreate as OneLegalTool<unknown>,
  [contractDraft.id]: contractDraft as OneLegalTool<unknown>,
  [dsarCreate.id]: dsarCreate as OneLegalTool<unknown>,
  [legalHoldCreate.id]: legalHoldCreate as OneLegalTool<unknown>,
  [invoiceReview.id]: invoiceReview as OneLegalTool<unknown>,
  [reviewStart.id]: reviewStart as OneLegalTool<unknown>,
  [legalHoldNotice.id]: legalHoldNotice as OneLegalTool<unknown>,
};

export function getTool(id: string): OneLegalTool<unknown> | undefined {
  return TOOLS[id];
}

/** Deterministic tool selection from request text — conservative, so most
 *  requests fall through to the normal governed intake pipeline. */
export function selectToolId(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(open|start|create|file|spin up)\b[^.]*\bmatter\b/.test(t) || /\bmatter\b[^.]*\b(for|on)\b/.test(t) || /\b(sued|lawsuit|litigation matter)\b/.test(t)) return "matter.create";
  // Draft-a-contract: needs an authoring verb so "review a third-party MSA"
  // (a review, not a create) falls through to the intake pipeline.
  if (/\b(draft|create|prepare|author|generate|write|new)\b[^.]*\b(nda|msa|sow|dpa|contract|agreement|licen[cs]e)\b/.test(t)) return "contracts.draft";
  if (/\bdsar\b|data subject (access|request|erasure)|right to (be forgotten|erasure|access)|(access|erasure|deletion) request/.test(t)) return "privacy.dsar.create";
  if (/\b(legal hold|litigation hold|preservation hold)\b|\bput\b[^.]*\bon hold\b|\bhold\b[^.]*\b(custodian|deal team|documents|evidence)\b|\bpreserve\b[^.]*\b(documents|evidence|data)\b/.test(t)) return "matter.legalhold.create";
  if (/\b(invoice|bill|legal spend)\b[^.]*\b(review|audit|check|scrub)\b|\breview\b[^.]*\b(invoice|bill)\b/.test(t)) return "spend.invoice.review";
  return null;
}

export interface ToolProposal { id: string; label: string; argsSummary: string; needsTarget?: ToolTarget }

/** A display-only proposal for a specific tool id (no execution). Used by the
 *  spine planner, which selects tools by id rather than from free text. */
export function proposalForTool(toolId: string, text: string): ToolProposal | null {
  const tool = TOOLS[toolId];
  if (!tool) return null;
  const args = tool.deriveArgs(text);
  return { id: toolId, label: tool.label, argsSummary: tool.summary(args), needsTarget: tool.needsTarget };
}

/** A display-only proposal for the console (no execution). */
export function toolProposalFor(text: string): ToolProposal | null {
  const id = selectToolId(text);
  if (!id) return null;
  return proposalForTool(id, text);
}

/**
 * The universal governed-execution path for ONE Legal mutations (OL-3).
 *
 * Every orchestrated mutation — not a hand-wired subset — runs through here, so
 * the `AgentDecision` gate is structural rather than per-tool: adding a tool to
 * the registry governs it automatically. Both human-approved surfaces (the
 * single-action `/api/one-legal/act` route and the streaming `/api/one-legal/run`
 * route) call this, so the gate behaves identically on each.
 *
 * Two-phase, mirroring the platform gate contract (a recommendation is born
 * PENDING; the only path off PENDING is a human Approve; the executed mutation
 * links back to the approved decision):
 *   1. write a PENDING `AgentDecision` (the proposal) BEFORE anything mutates;
 *   2. assert the tool's `Permission` (denials chain-sealed by SEC2);
 *   3. run the module `api.ts` mutation (which chain-seals its own audit);
 *   4. flip the decision PENDING → APPROVED, sealing in the approver, the
 *      resulting `one_legal.tool.executed` audit row, and the real resource id.
 *
 * This is reached only after a human Approve keystroke — the console never calls
 * the act/run execution path without one. If the gate denies or the mutation
 * throws, the orphan PENDING row is dropped so the ledger shows no approved or
 * executed action for a proposal that never ran.
 */
export interface GovernedExecution extends ToolResult {
  argsSummary: string;
  decisionId: string | null;
  auditLogId: string | null;
  /** Two-tier model: the REQ number of the tracking intake ticket this
   *  governed action back-filled, so it carries a request id and surfaces in
   *  the queue. Null when no requester Person resolved (ticket skipped). */
  requestNumber: string | null;
}

function decisionSeed(toolId: string, text: string, resourceType: string, args: unknown, label: string) {
  return {
    agentName: "one-legal",
    modelId: "one-legal",
    modelVersion: "1",
    promptHash: createHash("sha256").update(text).digest("hex"),
    recommendationJson: { toolId, args, label } as never,
    confidence: null,
    resourceType,
  };
}

export async function executeGovernedTool(
  tool: OneLegalTool<unknown>,
  input: { text: string; targetId?: string; user: AuthUser },
  opts: { route: string },
): Promise<GovernedExecution> {
  const { text, targetId, user } = input;
  const actor: OneLegalUser = { id: user.id, organizationId: user.organizationId };
  const args = tool.deriveArgs(text, targetId);
  const argsSummary = tool.summary(args);

  // Phase 1 — PENDING proposal, recorded before any mutation. The resource it
  // governs doesn't exist yet, so `resourceId` is filled in phase 4.
  let decisionId: string | null = null;
  try {
    const d = await prisma.agentDecision.create({
      data: { organizationId: user.organizationId, approvalStatus: "PENDING", ...decisionSeed(tool.id, text, tool.resourceType, args, argsSummary) },
      select: { id: true },
    });
    decisionId = d.id;
  } catch { /* evidence row is best-effort — never block the human-approved action */ }

  const dropOrphan = async () => {
    if (!decisionId) return;
    try { await prisma.agentDecision.delete({ where: { id: decisionId } }); } catch { /* ignore */ }
    decisionId = null;
  };

  // Phase 2 — the gate. Denials are chain-sealed (SEC2) inside assertAndAudit.
  try {
    await assertAndAudit(user, tool.permission, { resourceType: tool.resourceType, resourceId: tool.id, route: opts.route });
  } catch (err) { await dropOrphan(); throw err; }

  // Phase 3 — the mutation. The module api.ts function chain-seals its own audit.
  let result: ToolResult;
  try {
    result = await tool.run(args, actor);
  } catch (err) { await dropOrphan(); throw err; }

  // Phase 4 — the ONE Legal approval that authorized this action, on the chain,
  // plus the PENDING → APPROVED flip that links decision ⇄ audit ⇄ resource.
  let auditLogId: string | null = null;
  try {
    auditLogId = await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "one_legal.tool.executed",
      resourceType: tool.resourceType,
      resourceId: result.resourceId,
      afterJson: { toolId: tool.id, args, label: result.label } as never,
      metadata: { source: "one-legal", route: opts.route } as never,
    });
  } catch { /* audit is best-effort; never undoes the action */ }

  if (decisionId) {
    try {
      await prisma.agentDecision.update({
        where: { id: decisionId },
        data: { approvalStatus: "APPROVED", approvedById: user.id, approvedAt: new Date(), resultingAuditLogId: auditLogId, resourceId: result.resourceId },
      });
    } catch { /* seal is best-effort */ }
  } else {
    // Phase-1 write failed (e.g. DB hiccup): still capture the approved decision
    // so the executed mutation never lacks its governance evidence row.
    try {
      await prisma.agentDecision.create({
        data: {
          organizationId: user.organizationId,
          approvalStatus: "APPROVED", approvedById: user.id, approvedAt: new Date(),
          resultingAuditLogId: auditLogId, resourceId: result.resourceId,
          ...decisionSeed(tool.id, text, tool.resourceType, args, result.label),
        },
        select: { id: true },
      }).then((d) => { decisionId = d.id; });
    } catch { /* ignore */ }
  }

  // Two-tier model — a governed WRITE enters the approval ladder/workflow, so
  // it earns a REQ number and shows in the intake queue. Pure-assistance tiers
  // (ask/analyze/review/research/draft) never reach this path, so they stay
  // unticketed by construction. Best-effort: the governed action already
  // executed, so a back-fill failure never undoes it.
  let requestNumber: string | null = null;
  if (tool.kind === "write") {
    const matterId =
      tool.resourceType === "Matter"
        ? result.resourceId
        : tool.needsTarget?.kind === "matter" && targetId
          ? targetId
          : null;
    try {
      const ticket = await recordGovernedActionTicket({
        organizationId: user.organizationId,
        actor: { id: user.id, name: user.name ?? null },
        tool: { id: tool.id, label: tool.label },
        requestText: text,
        resource: {
          type: tool.resourceType,
          id: result.resourceId,
          label: result.resourceLabel,
          navigate: result.navigate,
        },
        matterId,
      });
      requestNumber = ticket?.ticketId ?? null;
    } catch { /* tracking ticket is best-effort — never undo the action */ }
  }

  return { ...result, argsSummary, decisionId, auditLogId, requestNumber };
}
