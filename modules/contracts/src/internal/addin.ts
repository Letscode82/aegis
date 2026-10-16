/**
 * Word add-in surface (PR E).
 *
 * The three verbs — Create, Review, Negotiate — reach counsel where they
 * already work: inside Word. This is the thin, stateless API an Office.js task
 * pane calls. It wraps services that already exist:
 *
 *   • reviewDocumentForAddin — extract clauses from pasted/selected document
 *     text (the deterministic extractor, extractContractKnowledge), grade them
 *     against the org's resolved Playbook (buildReviewFindings), and return the
 *     findings + suggested redline language. STATELESS — nothing is persisted;
 *     the human accepting a tracked change in Word is the governance gate, the
 *     same posture as redlineClause. When counsel wants the governed,
 *     chain-sealed review, they run it against a persisted Contract (PR C).
 *
 *   • redlineForAddin — rewrite one selected clause on our standard per a
 *     plain-language instruction, returning the track-changes segments the add-
 *     in renders as Word insertions/deletions (wraps redlineClause).
 *
 * Deterministic and degrade-safe: the review path never calls Claude; the
 * redline path degrades to a no-op when Claude is unavailable. Pure composition
 * (buildAddinReview) is unit-tested.
 */
import { extractContractKnowledge } from "./extract";
import { buildReviewFindings, summarizeFindings, type BuiltFinding, type ReviewSummary } from "./review";
import { getPlaybookForContract, ensureDefaultPlaybook, type PlaybookRuleDTO, type ContractPlaybookDTO } from "./playbook";
import { redlineClause, type RedlineResult, type RedlineRunner } from "./redline";
import type { ContractPerspective } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface AddinReviewItem {
  clauseType: string;
  grade: BuiltFinding["grade"];
  editKind: BuiltFinding["editKind"];
  ourPosition: string | null;
  theirPosition: string | null;
  rationale: string;
  /** The tracked-change target the add-in inserts into the document. */
  suggestedText: string | null;
}

export interface AddinReview {
  playbookId: string | null;
  summary: ReviewSummary;
  items: AddinReviewItem[];
}

// ── Pure composition (no DB, no AI — unit-tested) ─────────────────────

/**
 * Grade already-extracted clauses against playbook rules and shape them for the
 * add-in. Anchor ids are synthesised per occurrence since the add-in works on
 * free text, not persisted clause rows.
 */
export function buildAddinReview(
  clauses: { type: string; text: string }[],
  rules: PlaybookRuleDTO[],
): { summary: ReviewSummary; items: AddinReviewItem[] } {
  const findings = buildReviewFindings(
    clauses.map((c, i) => ({ anchorId: `addin-${i}`, clauseType: c.type, text: c.text })),
    rules,
  );
  const summary = summarizeFindings(findings);
  const items = findings
    .filter((f) => f.grade !== "STANDARD")
    .map((f) => ({
      clauseType: f.clauseType, grade: f.grade, editKind: f.editKind,
      ourPosition: f.ourPosition, theirPosition: f.theirPosition,
      rationale: f.rationale, suggestedText: f.suggestedText,
    }));
  return { summary, items };
}

// ── DB services ───────────────────────────────────────────────────────

/**
 * Grade pasted/selected document text against the org's resolved Playbook.
 * Stateless — persists nothing. Returns only actionable (non-standard) items so
 * the add-in surfaces exactly what to redline.
 */
export async function reviewDocumentForAddin(
  organizationId: string,
  input: { text: string; contractType?: string | null; perspective?: ContractPerspective | null },
  actor: Actor,
): Promise<AddinReview> {
  const text = (input.text ?? "").trim();
  if (!text) throw new Error("Document text is required");

  let playbook: ContractPlaybookDTO | null = await getPlaybookForContract(organizationId, { contractType: input.contractType ?? null, perspective: input.perspective ?? null });
  if (!playbook) playbook = await ensureDefaultPlaybook(organizationId, actor);
  const rules = playbook?.rules ?? [];

  const extracted = extractContractKnowledge(text, input.contractType ?? "");
  const { summary, items } = buildAddinReview(extracted.clauses.map((c) => ({ type: c.type, text: c.text })), rules);
  return { playbookId: playbook?.id ?? null, summary, items };
}

/**
 * Rewrite one selected clause per a plain-language instruction, on our
 * standard. Wraps redlineClause — returns the track-changes segments the add-in
 * renders in Word. Stateless (the redline service writes only a best-effort
 * "suggested" audit row when a contractId is supplied, which the add-in omits).
 */
export async function redlineForAddin(
  organizationId: string,
  input: { original: string; instruction: string; clauseType?: string | null; clauseLabel?: string | null },
  actor: Actor,
  runner?: RedlineRunner,
): Promise<RedlineResult> {
  return redlineClause(
    organizationId,
    { original: input.original, instruction: input.instruction, clauseType: input.clauseType ?? null, clauseLabel: input.clauseLabel ?? null },
    actor,
    runner,
  );
}
