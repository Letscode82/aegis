/**
 * Structured contract playbook (PR B).
 *
 * The typed, versioned position store the incumbents (Icertis, Ironclad) model
 * as a first-class object: per clause a PREFERRED position, acceptable
 * FALLBACK(s), a WALK-AWAY, required-language, guidance, and an escalation
 * trigger. This is what makes Review's grading real (Standard / Fallback /
 * Escalate), seeds Create's defaults, and powers Negotiate's counters.
 *
 * Split:
 *   • pure helpers (grading + proposal) — no DB, no AI, unit-tested;
 *   • DB services — CRUD + publish (freezes a PlaybookVersion snapshot);
 *   • generatePlaybookFromPrecedent — proposes rules from executed contracts
 *     and writes ONE PENDING AgentDecision per rule; a human approve is the
 *     only path to a live PlaybookRule (conservative AI governance).
 *
 * The KnowledgePack clause library stays for narrative guidance; this owns the
 * GRADEABLE positions.
 */
import {
  prisma,
  logAudit,
  sha256Hex,
  AgentApprovalStatus,
  type AgentDecision,
  type PlaybookRule,
  type ContractPlaybook,
  type ContractPerspective,
} from "@aegis/db";
import { CLAUDE_MODEL } from "@aegis/ai";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const AGENT_NAME = "contract-playbook-generator";
const RESOURCE_TYPE = "PlaybookRule";

// ── Types ─────────────────────────────────────────────────────────────

export type ClauseGrade = "STANDARD" | "FALLBACK" | "ESCALATE";

export interface PrecedentRef {
  contractId: string;
  clauseId?: string;
  note?: string;
}

export interface PlaybookRuleDTO {
  id: string;
  clauseType: string;
  clauseCode: string;
  title: string;
  preferredText: string;
  fallbackTexts: string[];
  walkAwayText: string | null;
  required: boolean;
  requiredLanguage: string | null;
  guidance: string | null;
  escalationTrigger: string | null;
  precedentRefs: PrecedentRef[];
  severityWeight: number;
  orderIndex: number;
}

export interface ContractPlaybookDTO {
  id: string;
  name: string;
  description: string | null;
  contractType: string | null;
  perspective: ContractPerspective | null;
  paperType: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  publishedAt: string | null;
  ruleCount: number;
  rules?: PlaybookRuleDTO[];
}

export interface GradeResult {
  grade: ClauseGrade;
  matched: "preferred" | "fallback" | "none";
  /** 0..1 similarity to the best-matching position. */
  score: number;
  /** True when the rule requires specific language the clause omits. */
  requiredLanguageMissing: boolean;
  fallbackIndex: number | null;
}

// ── Pure helpers (no DB, no AI — unit-tested) ────────────────────────

/** Lowercase, strip punctuation, collapse whitespace → word tokens. */
export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard similarity over word sets. Deterministic, 0..1. */
export function textSimilarity(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Does `clauseText` contain the rule's required language (loose, normalized)? */
export function containsRequiredLanguage(clauseText: string, requiredLanguage: string | null | undefined): boolean {
  if (!requiredLanguage || !requiredLanguage.trim()) return true;
  const need = tokenize(requiredLanguage);
  if (need.length === 0) return true;
  const have = new Set(tokenize(clauseText));
  let hit = 0;
  for (const w of need) if (have.has(w)) hit++;
  // require ~80% of the required tokens to be present
  return hit / need.length >= 0.8;
}

export const STANDARD_THRESHOLD = 0.6;
export const FALLBACK_THRESHOLD = 0.4;

/**
 * Grade a present clause against a rule. (MISSING — a required clause with no
 * text at all — is handled by the review layer, PR C, which knows the full
 * clause set.) Deterministic and explainable.
 */
export function gradeClauseAgainstRule(
  clauseText: string,
  rule: Pick<PlaybookRuleDTO, "preferredText" | "fallbackTexts" | "required" | "requiredLanguage">,
): GradeResult {
  const requiredLanguageMissing = rule.required && !containsRequiredLanguage(clauseText, rule.requiredLanguage);

  const preferredScore = textSimilarity(clauseText, rule.preferredText);
  let bestFallback = -1;
  let bestFallbackScore = 0;
  (rule.fallbackTexts || []).forEach((f, i) => {
    const s = textSimilarity(clauseText, f);
    if (s > bestFallbackScore) { bestFallbackScore = s; bestFallback = i; }
  });

  // Missing required language forces at best ESCALATE regardless of similarity.
  if (requiredLanguageMissing) {
    return { grade: "ESCALATE", matched: "none", score: Math.max(preferredScore, bestFallbackScore), requiredLanguageMissing, fallbackIndex: null };
  }
  if (preferredScore >= STANDARD_THRESHOLD && preferredScore >= bestFallbackScore) {
    return { grade: "STANDARD", matched: "preferred", score: preferredScore, requiredLanguageMissing, fallbackIndex: null };
  }
  if (bestFallbackScore >= FALLBACK_THRESHOLD) {
    return { grade: "FALLBACK", matched: "fallback", score: bestFallbackScore, requiredLanguageMissing, fallbackIndex: bestFallback };
  }
  return { grade: "ESCALATE", matched: "none", score: Math.max(preferredScore, bestFallbackScore), requiredLanguageMissing, fallbackIndex: null };
}

export interface ProposedRule {
  clauseType: string;
  clauseCode: string;
  title: string;
  preferredText: string;
  fallbackTexts: string[];
  precedentRefs: PrecedentRef[];
  occurrences: number;
}

interface PrecedentClause { contractId: string; clauseId: string; type: string; text: string; deviation: boolean }

/**
 * Deterministic proposal: group executed-precedent clauses by type, take the
 * most common NON-deviating language as the preferred position and the next
 * distinct variants as fallbacks. Pure — the AI refinement (if any) layers on
 * top, but this guarantees a usable proposal offline and is unit-tested.
 */
export function proposeRulesFromClauses(clauses: PrecedentClause[]): ProposedRule[] {
  const byType = new Map<string, PrecedentClause[]>();
  for (const c of clauses) {
    if (!c.text || !c.text.trim()) continue;
    const list = byType.get(c.type) || [];
    list.push(c);
    byType.set(c.type, list);
  }
  const out: ProposedRule[] = [];
  for (const [type, list] of byType) {
    // Prefer non-deviating clauses as the "agreed" position; fall back to all.
    const agreed = list.filter((c) => !c.deviation);
    const pool = agreed.length ? agreed : list;
    // Cluster by near-identical text; pick the largest cluster's representative.
    const clusters: { rep: PrecedentClause; members: PrecedentClause[] }[] = [];
    for (const c of pool) {
      const hit = clusters.find((cl) => textSimilarity(cl.rep.text, c.text) >= 0.8);
      if (hit) hit.members.push(c);
      else clusters.push({ rep: c, members: [c] });
    }
    clusters.sort((a, b) => b.members.length - a.members.length);
    const preferred = clusters[0];
    if (!preferred) continue;
    const fallbacks = clusters.slice(1, 3).map((cl) => cl.rep.text);
    out.push({
      clauseType: type,
      clauseCode: type.toUpperCase(),
      title: type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      preferredText: preferred.rep.text,
      fallbackTexts: fallbacks,
      precedentRefs: preferred.members.slice(0, 5).map((m) => ({ contractId: m.contractId, clauseId: m.clauseId })),
      occurrences: preferred.members.length,
    });
  }
  // Most-attested rules first.
  out.sort((a, b) => b.occurrences - a.occurrences);
  return out;
}

// ── DTO mappers ───────────────────────────────────────────────────────

function ruleToDTO(r: PlaybookRule): PlaybookRuleDTO {
  return {
    id: r.id,
    clauseType: r.clauseType,
    clauseCode: r.clauseCode,
    title: r.title,
    preferredText: r.preferredText,
    fallbackTexts: Array.isArray(r.fallbackTexts) ? (r.fallbackTexts as string[]) : [],
    walkAwayText: r.walkAwayText,
    required: r.required,
    requiredLanguage: r.requiredLanguage,
    guidance: r.guidance,
    escalationTrigger: r.escalationTrigger,
    precedentRefs: Array.isArray(r.precedentRefs) ? (r.precedentRefs as unknown as PrecedentRef[]) : [],
    severityWeight: r.severityWeight,
    orderIndex: r.orderIndex,
  };
}

function playbookToDTO(p: ContractPlaybook & { rules?: PlaybookRule[]; _count?: { rules: number } }): ContractPlaybookDTO {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    contractType: p.contractType,
    perspective: p.perspective,
    paperType: p.paperType,
    status: p.status,
    version: p.version,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    ruleCount: p._count?.rules ?? p.rules?.length ?? 0,
    rules: p.rules ? p.rules.map(ruleToDTO) : undefined,
  };
}

// ── CRUD services ─────────────────────────────────────────────────────

export async function listPlaybooks(organizationId: string): Promise<ContractPlaybookDTO[]> {
  const rows = await prisma.contractPlaybook.findMany({
    where: { organizationId },
    include: { _count: { select: { rules: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map((p) => playbookToDTO(p));
}

export async function getPlaybook(organizationId: string, id: string): Promise<ContractPlaybookDTO | null> {
  const p = await prisma.contractPlaybook.findFirst({
    where: { id, organizationId },
    include: { rules: { orderBy: [{ orderIndex: "asc" }, { clauseType: "asc" }] } },
  });
  return p ? playbookToDTO(p) : null;
}

/**
 * Resolve the PUBLISHED playbook that best fits a contract's (type,
 * perspective). Most-specific match wins: an exact type+perspective playbook
 * over a type-only over an any-scope one. Returns null when none is published.
 */
export async function getPlaybookForContract(
  organizationId: string,
  opts: { contractType?: string | null; perspective?: ContractPerspective | null },
): Promise<ContractPlaybookDTO | null> {
  const candidates = await prisma.contractPlaybook.findMany({
    where: { organizationId, status: "PUBLISHED" },
    include: { rules: { orderBy: [{ orderIndex: "asc" }, { clauseType: "asc" }] } },
  });
  if (candidates.length === 0) return null;
  const score = (p: ContractPlaybook) => {
    let s = 0;
    if (p.contractType && opts.contractType && p.contractType.toUpperCase() === opts.contractType.toUpperCase()) s += 2;
    else if (p.contractType) return -1; // type-specific but doesn't match → ineligible
    if (p.perspective && opts.perspective && p.perspective === opts.perspective) s += 1;
    else if (p.perspective && opts.perspective && p.perspective !== opts.perspective) return -1;
    return s;
  };
  const ranked = candidates
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  const best = ranked[0]?.p;
  return best ? playbookToDTO(best) : null;
}

export interface CreatePlaybookInput {
  name: string;
  description?: string | null;
  contractType?: string | null;
  perspective?: ContractPerspective | null;
  paperType?: string | null;
}

export async function createPlaybook(organizationId: string, input: CreatePlaybookInput, actor: Actor): Promise<ContractPlaybookDTO> {
  if (!input.name?.trim()) throw new Error("Playbook name is required");
  const p = await prisma.contractPlaybook.create({
    data: {
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      contractType: input.contractType?.trim() || null,
      perspective: input.perspective ?? null,
      paperType: input.paperType?.trim() || null,
      status: "DRAFT",
      version: 1,
      createdById: actor.id,
    },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.created", resourceType: "ContractPlaybook", resourceId: p.id,
    afterJson: { name: p.name, contractType: p.contractType, perspective: p.perspective } as never,
    metadata: { source: "contracts" } as never,
  });
  return playbookToDTO({ ...p, rules: [] });
}

export interface UpsertPlaybookRuleInput {
  id?: string;
  clauseType: string;
  clauseCode?: string;
  title?: string;
  preferredText: string;
  fallbackTexts?: string[];
  walkAwayText?: string | null;
  required?: boolean;
  requiredLanguage?: string | null;
  guidance?: string | null;
  escalationTrigger?: string | null;
  precedentRefs?: PrecedentRef[];
  severityWeight?: number;
  orderIndex?: number;
}

export async function upsertPlaybookRule(
  organizationId: string,
  playbookId: string,
  input: UpsertPlaybookRuleInput,
  actor: Actor,
): Promise<PlaybookRuleDTO> {
  const pb = await prisma.contractPlaybook.findFirst({ where: { id: playbookId, organizationId }, select: { id: true, status: true } });
  if (!pb) throw new Error("Playbook not found");
  if (pb.status === "ARCHIVED") throw new Error("Cannot edit an archived playbook");
  if (!input.clauseType?.trim()) throw new Error("clauseType is required");
  if (!input.preferredText?.trim()) throw new Error("A preferred position is required");

  const clauseType = input.clauseType.trim().toUpperCase();
  const clauseCode = (input.clauseCode?.trim() || clauseType).toUpperCase();
  const data = {
    clauseType,
    clauseCode,
    title: input.title?.trim() || clauseType.replace(/_/g, " "),
    preferredText: input.preferredText.trim(),
    fallbackTexts: (input.fallbackTexts ?? []).filter((t) => t && t.trim()) as never,
    walkAwayText: input.walkAwayText?.trim() || null,
    required: input.required ?? false,
    requiredLanguage: input.requiredLanguage?.trim() || null,
    guidance: input.guidance?.trim() || null,
    escalationTrigger: input.escalationTrigger?.trim() || null,
    precedentRefs: (input.precedentRefs ?? []) as never,
    severityWeight: input.severityWeight ?? 1,
    orderIndex: input.orderIndex ?? 0,
  };

  let rule: PlaybookRule;
  if (input.id) {
    rule = await prisma.playbookRule.update({ where: { id: input.id }, data });
  } else {
    rule = await prisma.playbookRule.upsert({
      where: { playbookId_clauseCode: { playbookId, clauseCode } },
      update: data,
      create: { organizationId, playbookId, ...data },
    });
  }
  await prisma.contractPlaybook.update({ where: { id: playbookId }, data: { updatedAt: new Date() } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.rule.updated", resourceType: RESOURCE_TYPE, resourceId: rule.id,
    afterJson: { playbookId, clauseType, clauseCode, required: data.required } as never,
    metadata: { source: "contracts" } as never,
  });
  return ruleToDTO(rule);
}

export async function deletePlaybookRule(organizationId: string, playbookId: string, ruleId: string, actor: Actor): Promise<void> {
  const rule = await prisma.playbookRule.findFirst({ where: { id: ruleId, playbookId, organizationId } });
  if (!rule) throw new Error("Rule not found");
  await prisma.playbookRule.delete({ where: { id: ruleId } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.rule.deleted", resourceType: RESOURCE_TYPE, resourceId: ruleId,
    beforeJson: { clauseType: rule.clauseType, clauseCode: rule.clauseCode } as never,
    metadata: { source: "contracts" } as never,
  });
}

/**
 * Publish a playbook: freeze an immutable PlaybookVersion snapshot of its
 * current rules and flip it to PUBLISHED, bumping the version. Any other
 * PUBLISHED playbook with the same (contractType, perspective) scope is
 * archived so exactly one governs a scope.
 */
export async function publishPlaybook(organizationId: string, playbookId: string, actor: Actor, note?: string): Promise<ContractPlaybookDTO> {
  const pb = await prisma.contractPlaybook.findFirst({
    where: { id: playbookId, organizationId },
    include: { rules: { orderBy: [{ orderIndex: "asc" }, { clauseType: "asc" }] } },
  });
  if (!pb) throw new Error("Playbook not found");
  if (pb.rules.length === 0) throw new Error("Add at least one rule before publishing");

  const result = await prisma.$transaction(async (tx) => {
    // Supersede sibling PUBLISHED playbooks in the same scope.
    await tx.contractPlaybook.updateMany({
      where: {
        organizationId, status: "PUBLISHED", id: { not: playbookId },
        contractType: pb.contractType, perspective: pb.perspective,
      },
      data: { status: "ARCHIVED" },
    });
    const nextVersion = pb.status === "PUBLISHED" ? pb.version + 1 : pb.version;
    await tx.playbookVersion.create({
      data: {
        organizationId, playbookId, version: nextVersion,
        rulesJson: pb.rules.map(ruleToDTO) as never,
        note: note?.trim() || null, publishedById: actor.id,
      },
    });
    return tx.contractPlaybook.update({
      where: { id: playbookId },
      data: { status: "PUBLISHED", version: nextVersion, publishedAt: new Date(), publishedById: actor.id },
      include: { rules: { orderBy: [{ orderIndex: "asc" }, { clauseType: "asc" }] } },
    });
  });

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.published", resourceType: "ContractPlaybook", resourceId: playbookId,
    afterJson: { version: result.version, ruleCount: result.rules.length } as never,
    metadata: { source: "contracts" } as never,
  });
  return playbookToDTO(result);
}

/**
 * Idempotent backfill: if the org has no playbook yet, create a default one
 * from the existing clause-library (KnowledgeItem) positions and publish it so
 * grading has something to grade against. No-op when a playbook already
 * exists. Runs at seed time and behind an admin "ensure default" action — NOT
 * inside a migration (keeps migrations deterministic). Returns the default
 * playbook (existing or freshly created), or null when there's nothing to
 * backfill from.
 */
export async function ensureDefaultPlaybook(organizationId: string, actor: Actor): Promise<ContractPlaybookDTO | null> {
  const existing = await prisma.contractPlaybook.findFirst({ where: { organizationId }, select: { id: true } });
  if (existing) return getPlaybook(organizationId, existing.id);

  // Read the clause-library positions via raw query to avoid a circular import.
  const pack = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: "contract-clauses" } },
    select: { id: true },
  });
  if (!pack) return null;
  const items = await prisma.knowledgeItem.findMany({
    where: { packId: pack.id, kind: "CLAUSE", active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  if (items.length === 0) return null;

  const pb = await createPlaybook(
    organizationId,
    { name: "Default contract playbook", description: "Backfilled from the clause library — edit positions and publish new versions." },
    actor,
  );
  let order = 0;
  for (const it of items) {
    const d = (it.dataJson as Record<string, unknown>) ?? {};
    await upsertPlaybookRule(
      organizationId, pb.id,
      {
        clauseType: it.code,
        clauseCode: it.code,
        title: it.title,
        preferredText: it.bodyMarkdown,
        fallbackTexts: d.fallbackText ? [String(d.fallbackText)] : [],
        guidance: (d.guidance as string) ?? null,
        severityWeight: String(d.riskIfDeviated ?? d.severityIfDeviated).toUpperCase() === "HIGH" ? 3 : String(d.riskIfDeviated ?? d.severityIfDeviated).toUpperCase() === "LOW" ? 1 : 2,
        orderIndex: order++,
      },
      actor,
    );
  }
  return publishPlaybook(organizationId, pb.id, actor, "Initial backfill from clause library");
}

// ── generate-from-precedent (human-gated via AgentDecision) ───────────

export interface GeneratedRuleDecisionDTO {
  decisionId: string;
  status: "PENDING" | "APPROVED" | "APPROVED_WITH_OVERRIDE" | "REJECTED" | "AUTO_REJECTED";
  playbookId: string;
  proposed: ProposedRule;
}

function decisionToGeneratedDTO(d: AgentDecision): GeneratedRuleDecisionDTO {
  const rec = (d.recommendationJson ?? {}) as Record<string, unknown>;
  return {
    decisionId: d.id,
    status: d.approvalStatus as GeneratedRuleDecisionDTO["status"],
    playbookId: String(rec.playbookId ?? ""),
    proposed: (rec.proposed ?? {}) as ProposedRule,
  };
}

/**
 * Propose playbook rules from the org's executed contracts and write ONE
 * PENDING AgentDecision per proposed rule. Nothing becomes a live rule until a
 * human approves it (resolveGeneratedRule). This is the "we don't have a
 * playbook" bootstrap — provenance (precedentRefs) rides each proposal.
 */
export async function generatePlaybookFromPrecedent(
  organizationId: string,
  playbookId: string,
  actor: Actor,
  opts?: { contractType?: string | null; limit?: number },
): Promise<GeneratedRuleDecisionDTO[]> {
  const pb = await prisma.contractPlaybook.findFirst({ where: { id: playbookId, organizationId }, select: { id: true, contractType: true } });
  if (!pb) throw new Error("Playbook not found");

  const type = opts?.contractType ?? pb.contractType ?? undefined;
  const clauses = await prisma.contractClause.findMany({
    where: {
      contract: {
        organizationId,
        status: { in: ["EXECUTED", "ACTIVE"] },
        ...(type ? { type } : {}),
      },
    },
    select: { id: true, type: true, text: true, deviation: true, contractId: true },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 600,
  });
  if (clauses.length === 0) throw new Error("No executed contracts to learn from yet");

  const proposals = proposeRulesFromClauses(
    clauses.map((c) => ({ contractId: c.contractId, clauseId: c.id, type: c.type, text: c.text, deviation: c.deviation })),
  );
  if (proposals.length === 0) throw new Error("Could not derive any clause positions from precedent");

  const out: GeneratedRuleDecisionDTO[] = [];
  for (const proposed of proposals) {
    const recommendationJson = { playbookId, proposed };
    const promptHash = sha256Hex(`${playbookId}:${proposed.clauseCode}:${proposed.preferredText}`);
    const decision = await prisma.agentDecision.create({
      data: {
        organizationId, resourceType: RESOURCE_TYPE, resourceId: playbookId,
        agentName: AGENT_NAME, modelId: CLAUDE_MODEL, modelVersion: "deterministic-precedent",
        promptHash, recommendationJson: recommendationJson as never,
        confidence: Math.min(1, proposed.occurrences / 10),
        approvalStatus: AgentApprovalStatus.PENDING,
      },
    });
    out.push(decisionToGeneratedDTO(decision));
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.rule.generated", resourceType: "ContractPlaybook", resourceId: playbookId,
    afterJson: { proposed: proposals.length, fromClauses: clauses.length } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });
  return out;
}

/** List pending (or all) generated-rule decisions for a playbook. */
export async function listGeneratedRuleDecisions(organizationId: string, playbookId: string, opts?: { pendingOnly?: boolean }): Promise<GeneratedRuleDecisionDTO[]> {
  const rows = await prisma.agentDecision.findMany({
    where: {
      organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE, resourceId: playbookId,
      ...(opts?.pendingOnly ? { approvalStatus: AgentApprovalStatus.PENDING } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(decisionToGeneratedDTO);
}

/**
 * Resolve a generated-rule decision. Approve writes/updates the PlaybookRule
 * (optionally with an operator-edited proposal); reject records the verdict.
 * The approve keystroke is the only path to a live rule — chain-sealed.
 */
export async function resolveGeneratedRule(
  organizationId: string,
  decisionId: string,
  action: "approve" | "reject",
  actor: Actor,
  opts?: { edited?: Partial<UpsertPlaybookRuleInput> },
): Promise<GeneratedRuleDecisionDTO> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) throw new Error("This proposal has already been resolved — the verdict is immutable.");

  const rec = (decision.recommendationJson ?? {}) as Record<string, unknown>;
  const playbookId = String(rec.playbookId ?? decision.resourceId);
  const proposed = (rec.proposed ?? {}) as ProposedRule;

  if (action === "reject") {
    const auditId = await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
      action: "playbook.rule.generation_rejected", resourceType: RESOURCE_TYPE, resourceId: playbookId,
      afterJson: { clauseCode: proposed.clauseCode } as never,
      metadata: { source: "contracts", agent: AGENT_NAME } as never,
    });
    const updated = await prisma.agentDecision.update({
      where: { id: decision.id },
      data: { approvalStatus: AgentApprovalStatus.REJECTED, approvedById: actor.id, approvedAt: new Date(), resultingAuditLogId: auditId },
    });
    return decisionToGeneratedDTO(updated);
  }

  const edited = opts?.edited ?? {};
  const overrode = Object.keys(edited).length > 0;
  await upsertPlaybookRule(
    organizationId, playbookId,
    {
      clauseType: edited.clauseType ?? proposed.clauseType,
      clauseCode: edited.clauseCode ?? proposed.clauseCode,
      title: edited.title ?? proposed.title,
      preferredText: edited.preferredText ?? proposed.preferredText,
      fallbackTexts: edited.fallbackTexts ?? proposed.fallbackTexts,
      walkAwayText: edited.walkAwayText,
      required: edited.required,
      requiredLanguage: edited.requiredLanguage,
      guidance: edited.guidance,
      escalationTrigger: edited.escalationTrigger,
      precedentRefs: edited.precedentRefs ?? proposed.precedentRefs,
      severityWeight: edited.severityWeight,
      orderIndex: edited.orderIndex,
    },
    actor,
  );

  const auditId = await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "playbook.rule.approved", resourceType: RESOURCE_TYPE, resourceId: playbookId,
    afterJson: { clauseCode: edited.clauseCode ?? proposed.clauseCode, overrode } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });
  const updated = await prisma.agentDecision.update({
    where: { id: decision.id },
    data: {
      approvalStatus: overrode ? AgentApprovalStatus.APPROVED_WITH_OVERRIDE : AgentApprovalStatus.APPROVED,
      approvedById: actor.id, approvedAt: new Date(), resultingAuditLogId: auditId,
      overrideReason: overrode ? "Reviewer edited the proposed rule before approving." : null,
    },
  });
  return decisionToGeneratedDTO(updated);
}
