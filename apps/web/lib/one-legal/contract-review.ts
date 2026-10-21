/**
 * ONE Legal ↔ Contracts review parity (redesign PR 2).
 *
 * Before this module, "Review against playbook" in the ONE Legal console ran a
 * freeform `@aegis/legal-skills` playbook (prose from the model), while the
 * Contracts workspace graded each clause Standard / Fallback / Escalate / Missing
 * against the org's structured Playbook (`startContractReview`). Same contract,
 * two engines, two different verdicts — the "not in sync" problem.
 *
 * This points the console's contract review at the SAME engine the workspace
 * uses: `@aegis/contracts.reviewDocumentForAddin` resolves the identical Playbook
 * (`getPlaybookForContract` → `ensureDefaultPlaybook`) and grades with the
 * identical pure core (`buildReviewFindings` / `summarizeFindings`). So the
 * command bar and the workspace now return the same grades, the same verdict, and
 * the same risk band for the same document.
 *
 * Deterministic and degrade-safe: the grading never calls the model, so a
 * contract review in the console works even when the AI proxy is offline (a
 * strict improvement over the prose path, which degraded to an apology). When the
 * document isn't contract-shaped — no clauses extract — this returns null and the
 * caller falls through to the legal-skills prose review, so nothing regresses for
 * non-contract documents.
 */
import { reviewDocumentForAddin, type AddinReview } from "@aegis/contracts";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ContractReviewResult {
  /** The matched-playbook chip the console renders (same shape as a legal-skill match). */
  matched: { id: string; title: string; module: string; risk_tier: string; status: string };
  /** The review as clean Markdown — the console renders this as the answer. */
  markdown: string;
  /** The structured grade summary, carried through for callers that want the raw numbers. */
  review: AddinReview;
}

const GRADE_LABEL: Record<string, string> = {
  STANDARD: "Within standard",
  FALLBACK: "Fallback — acceptable with caveats",
  ESCALATE: "Escalate — outside standard",
  MISSING: "Missing — clause not present",
};

/** A short, scannable risk-band word for the matched chip's risk_tier. */
function riskTierFor(band: string | null | undefined): string {
  switch (String(band || "").toUpperCase()) {
    case "HIGH":
      return "high-risk";
    case "MEDIUM":
      return "review-required";
    default:
      return "low-risk";
  }
}

/**
 * Format the structured graded findings into the same Bottom line / Findings /
 * Actions shape the console already renders for a review — but now every grade,
 * the verdict, and the risk band come from the governed Contracts Playbook
 * engine, identical to the workspace.
 */
export function formatContractReviewMarkdown(docName: string | null | undefined, review: AddinReview): string {
  const s = review.summary;
  const name = String(docName || "the document").trim() || "the document";
  const lines: string[] = [];

  lines.push(`**Bottom line.** ${s.verdict} Risk band: **${s.riskBand}** · playbook score ${s.weightedScore}/100.`);
  lines.push(
    `Graded ${s.total} clause${s.total === 1 ? "" : "s"} against your Contracts Playbook: ` +
      `${s.standard} within standard, ${s.fallback} fallback, ${s.escalate} to escalate, ${s.missing} missing.`,
  );
  lines.push("");

  if (review.items.length === 0) {
    lines.push(`**Findings.** Every graded clause in ${name} sits within your standard positions — nothing to escalate.`);
    lines.push("");
    lines.push("**Actions.** No redlines needed. A qualified lawyer should still confirm before signature.");
    return lines.join("\n");
  }

  lines.push(`**Findings** (highest severity first) — ${review.items.length} clause${review.items.length === 1 ? "" : "s"} off standard:`);
  lines.push("");
  // items arrive severity-ordered from buildReviewFindings; keep that order.
  for (const it of review.items) {
    const grade = GRADE_LABEL[it.grade] || it.grade;
    lines.push(`- **${it.clauseType}** — ${grade}.`);
    if (it.rationale) lines.push(`  - ${it.rationale}`);
    if (it.ourPosition) lines.push(`  - Our standard position: ${it.ourPosition}`);
    if (it.theirPosition) lines.push(`  - Their position: ${it.theirPosition}`);
    if (it.suggestedText) lines.push(`  - Suggested redline: ${it.suggestedText}`);
  }
  lines.push("");
  lines.push(
    "**Actions.** Open this contract in the Contracts workspace to accept, edit, or reject each redline — " +
      "the same findings are waiting there, where each decision is chain-sealed. A qualified lawyer should confirm before signature.",
  );
  return lines.join("\n");
}

/**
 * Run the governed Contracts Playbook review on a document's text and shape it
 * for the console. Returns null when the document isn't contract-shaped (no
 * clauses extract), so the caller falls through to the legal-skills prose path.
 * Best-effort: any failure returns null rather than blocking the review.
 */
export async function runContractPlaybookReview(
  organizationId: string,
  input: { text: string; docName?: string | null; contractType?: string | null },
  actor: Actor,
): Promise<ContractReviewResult | null> {
  const text = String(input.text || "").trim();
  if (text.length < 40) return null; // too short to be a contract — let prose handle it

  let review: AddinReview;
  try {
    review = await reviewDocumentForAddin(organizationId, { text, contractType: input.contractType ?? null }, actor);
  } catch {
    return null; // fall through to the legal-skills prose review
  }

  // No clauses extracted → not a contract document. Fall through so a policy memo
  // or a general question still gets the prose playbook rather than an empty grade.
  if (!review.summary || review.summary.total === 0) return null;

  return {
    matched: {
      id: "contracts/playbook-graded",
      title: "AEGIS Contracts Playbook",
      module: "contracts",
      risk_tier: riskTierFor(review.summary.riskBand),
      status: "built",
    },
    markdown: formatContractReviewMarkdown(input.docName, review),
    review,
  };
}
