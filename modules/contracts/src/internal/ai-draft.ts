/**
 * AI contract drafting (CTR-14).
 *
 * Draft a full contract from a plain-language brief + key terms, instead of only
 * filling a fixed template. Claude writes the body using our playbook positions
 * as the standard; the result is created as a DRAFT — the human still reviews,
 * edits, and runs it through the approval ladder (the lifecycle is the gate).
 * Degrades to a deterministic skeleton when the model is unavailable, so the
 * flow never dead-ends.
 */
import { callClaude, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { prisma } from "@aegis/db";
import type { ContractPerspective } from "@aegis/db";
import { createContract } from "./service";
import { extractAndPersistContractKnowledge } from "./intake-spawn";
import { getClauseLibraryByType } from "./clause-library";

type Actor = { id: string; type?: "USER" | "AGENT" | "SYSTEM" };

export interface AiDraftInput {
  title: string;
  type: string;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  /** Plain-language instructions: what the deal is, special terms, posture. */
  brief: string;
  value?: number | null;
  currency?: string | null;
  governingLaw?: string | null;
  paymentTerms?: string | null;
  termMonths?: number | null;
  /**
   * Which side the draft is for (guided-draft PR A). MUTUAL = even-handed
   * (a mutual NDA), OUR_SIDE = protective of us, etc. Shapes the drafting
   * posture in the prompt and is persisted on the Contract. Defaults to
   * OUR_SIDE when omitted (the historical behaviour).
   */
  perspective?: ContractPerspective | null;
  /** Free-text special carve-outs / bespoke terms gathered by the guided card. */
  specialTerms?: string | null;
}

export interface AiDraftResult {
  contractId: string;
  degraded: boolean;
  clauseCount: number;
  /**
   * When `degraded` is true, the reason the Claude call failed (the caught
   * error message), surfaced through the API response so the failure is
   * diagnosable without digging through server logs. Null on success.
   */
  degradedReason?: string | null;
}

/**
 * Pull the contract text out of a model reply. The draft prompt asks for plain
 * text, but be defensive: strip markdown code fences, and if an older/strict
 * model still returns a {"draftText": "..."} (or text/body/contract) JSON
 * envelope, unwrap that instead of persisting the raw JSON as the contract body.
 */
export function unwrapDraftText(s: string): string {
  let t = (s || "").trim();
  t = t.replace(/^```(?:json|text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (t.startsWith("{") && /"(?:draftText|text|contract|body)"\s*:/.test(t)) {
    try {
      const obj = parseJSONLoose(t) as Record<string, unknown>;
      const v = obj?.draftText ?? obj?.text ?? obj?.contract ?? obj?.body;
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    } catch {
      /* not valid JSON — fall through and use the raw text */
    }
  }
  return t;
}

/** One line describing the drafting posture for a given perspective. */
export function postureLine(perspective?: ContractPerspective | null): string {
  switch (perspective) {
    case "MUTUAL":
      return "You are senior in-house counsel drafting an EVEN-HANDED (MUTUAL) agreement — balanced obligations on both sides, reasonable for either party to sign.";
    case "THEIR_SIDE":
      return "You are counsel drafting this agreement representing the COUNTERPARTY's side — favour the counterparty where the playbook allows.";
    case "NEUTRAL":
      return "You are counsel drafting a NEUTRAL agreement with no side bias (e.g. a joint agreement).";
    case "OUR_SIDE":
    default:
      return "You are senior in-house counsel drafting a contract ON OUR PAPER (our standard, protective of us).";
  }
}

export function buildDraftPrompt(input: AiDraftInput, playbook: Record<string, { standardText: string }>): string {
  const standards = Object.entries(playbook).slice(0, 20).map(([type, e]) => `- ${type}: ${e.standardText.slice(0, 300)}`).join("\n");
  const terms = [
    input.value != null ? `Value: ${input.currency || "USD"} ${input.value}` : null,
    input.paymentTerms ? `Payment terms: ${input.paymentTerms}` : null,
    input.termMonths ? `Term: ${input.termMonths} months` : null,
    input.governingLaw ? `Governing law: ${input.governingLaw}` : null,
  ].filter(Boolean).join("; ");
  return [
    postureLine(input.perspective),
    `Draft a complete "${input.type}" titled "${input.title}"${input.counterpartyName ? ` with counterparty "${input.counterpartyName}"` : ""}.`,
    terms ? `Key terms: ${terms}.` : "",
    "",
    "Instructions from the business:",
    input.brief.slice(0, 6000),
    input.specialTerms ? `\nSpecial terms / carve-outs to incorporate:\n${input.specialTerms.slice(0, 2000)}` : "",
    "",
    standards ? `Use OUR standard clause positions where they apply:\n${standards}` : "",
    "",
    "Write a full, well-structured agreement with numbered sections and standard protective clauses (parties, term, payment, confidentiality, IP, liability cap, indemnity, termination, governing law, etc.) as appropriate for the type.",
    "Return ONLY the full agreement text itself — numbered sections, plain text. Do not add commentary, do not wrap it in JSON, and do not use code fences.",
  ].filter(Boolean).join("\n");
}

/** Deterministic skeleton so the flow works with Claude offline. */
function fallbackSkeleton(input: AiDraftInput): string {
  const cp = input.counterpartyName || "[Counterparty]";
  const term = input.termMonths ? `${input.termMonths} months` : "[Term]";
  const val = input.value != null ? `${input.currency || "USD"} ${input.value}` : "[Value]";
  return [
    `${input.title.toUpperCase()}`,
    "",
    `This ${input.type} ("Agreement") is entered into between the Company and ${cp} ("Counterparty").`,
    "",
    "1. TERM. " + `This Agreement is effective on the Effective Date and continues for ${term}.`,
    "2. SCOPE. " + (input.brief || "[Scope of services / subject matter.]"),
    `3. FEES. The fees under this Agreement are ${val}. ${input.paymentTerms || "Payment terms: [Net 30]."}`,
    "4. CONFIDENTIALITY. Each party shall protect the other's Confidential Information and use it only for this Agreement.",
    "5. INTELLECTUAL PROPERTY. Each party retains its pre-existing IP; deliverables IP is as agreed in an SOW.",
    "6. LIABILITY. Each party's aggregate liability is capped at the fees paid in the 12 months preceding the claim; no indirect or consequential damages.",
    "7. INDEMNITY. Each party indemnifies the other for third-party claims arising from its breach or negligence.",
    "8. TERMINATION. Either party may terminate for uncured material breach on 30 days' notice.",
    `9. GOVERNING LAW. This Agreement is governed by ${input.governingLaw || "[Governing law]"}.`,
    "",
    "[AI drafting was unavailable — this is a deterministic skeleton for the attorney to complete.]",
  ].join("\n");
}

export async function draftContractWithAI(
  organizationId: string,
  input: AiDraftInput,
  actor: Actor,
): Promise<AiDraftResult> {
  if (!input.title?.trim()) throw new Error("Title is required");
  if (!input.brief?.trim()) throw new Error("Describe what the contract should cover");

  const playbook = await getClauseLibraryByType(organizationId).catch(() => ({}) as Record<string, { standardText: string }>);

  let draftText = "";
  let degraded = true;
  let degradedReason: string | null = null;
  try {
    ensureServerClaudeTransport();
    const prompt = buildDraftPrompt(input, playbook);
    // Generate the contract as PLAIN TEXT, not as a {"draftText": "..."} JSON
    // envelope. Forcing a whole multi-page agreement — with its quotes,
    // newlines and section numbers — through one JSON string field was the
    // single most fragile step in the old path: one unescaped quote and
    // JSON.parse throws, the error is caught, and the user silently gets the
    // deterministic skeleton even though Claude wrote a perfectly good
    // contract. Plain text removes that failure mode; unwrapDraftText still
    // salvages a JSON/fenced reply from an older-shaped response.
    const raw = await callClaude(prompt, { maxTokens: 4000, timeout: 90000 });
    const t = unwrapDraftText(raw);
    if (t.trim().length > 120) { draftText = t; degraded = false; }
    else degradedReason = "Model returned an empty or too-short draft";
  } catch (e) {
    degradedReason = String((e as Error)?.message || e);
    console.error("[contract-ai-draft] draft generation failed, using deterministic skeleton:", e);
  }
  if (!draftText) draftText = fallbackSkeleton(input);

  const contract = await createContract(
    organizationId,
    {
      title: input.title.trim(),
      type: input.type || "Contract",
      status: "DRAFT",
      origin: "OUR_PAPER",
      perspective: input.perspective ?? "OUR_SIDE",
      draftText,
      counterpartyId: input.counterpartyId ?? null,
      value: input.value ?? null,
      currency: input.currency ?? "USD",
      governingLaw: input.governingLaw ?? null,
    },
    actor,
  );

  const extraction = await extractAndPersistContractKnowledge(
    organizationId,
    contract.id,
    draftText,
    contract.type,
    { id: actor.id, type: "USER" },
    { initialSnapshotLabel: degraded ? "AI draft (fallback skeleton)" : "AI-generated draft" },
  );

  return { contractId: contract.id, degraded, clauseCount: extraction.clauses, degradedReason: degraded ? degradedReason : null };
}

/** Input for drafting a new contract modeled on an executed precedent. */
export interface DraftFromPrecedentInput {
  /** The precedent contract to model the new draft on (same org). */
  precedentContractId: string;
  /** What to change / adapt from the precedent (new parties, deal specifics). */
  brief: string;
  /** Title for the NEW contract. Defaults to the precedent title + " (new)". */
  title?: string;
  /** Overrides — default to the precedent's own values when omitted. */
  type?: string;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  governingLaw?: string | null;
  perspective?: ContractPerspective | null;
  specialTerms?: string | null;
}

export interface DraftFromPrecedentResult extends AiDraftResult {
  precedentContractId: string;
}

export function buildPrecedentPrompt(
  precedent: { title: string; type: string; body: string; perspective: ContractPerspective | null },
  input: DraftFromPrecedentInput,
): string {
  const perspective = input.perspective ?? precedent.perspective ?? "OUR_SIDE";
  return [
    postureLine(perspective),
    `Draft a NEW "${input.type || precedent.type}" modeled on the executed precedent "${precedent.title}" below.`,
    "Keep the precedent's structure and protective positions; adapt only the deal-specific terms per the brief.",
    input.counterpartyName ? `New counterparty: "${input.counterpartyName}".` : "",
    input.governingLaw ? `Governing law: ${input.governingLaw}.` : "",
    "",
    "Brief — what to change from the precedent:",
    input.brief.slice(0, 4000),
    input.specialTerms ? `\nSpecial terms / carve-outs:\n${input.specialTerms.slice(0, 2000)}` : "",
    "",
    "PRECEDENT (model the new agreement on this):",
    precedent.body.slice(0, 9000),
    "",
    "Return ONLY the full new agreement text itself — plain text, numbered sections. Do not add commentary, do not wrap it in JSON, and do not use code fences.",
  ].filter(Boolean).join("\n");
}

/**
 * Draft a new contract modeled on a prior executed agreement (the v2
 * "draft from precedent" option). Reads the precedent's own body — its
 * `draftText` if present, else its latest version's clause snapshot
 * concatenated — seeds generation, and creates a DRAFT on our paper just
 * like `draftContractWithAI`. Degrades to a copy-of-precedent skeleton when
 * the model is unavailable so the flow never dead-ends.
 */
export async function draftFromPrecedent(
  organizationId: string,
  input: DraftFromPrecedentInput,
  actor: Actor,
): Promise<DraftFromPrecedentResult> {
  if (!input.precedentContractId) throw new Error("A precedent contract is required");
  if (!input.brief?.trim()) throw new Error("Describe what to adapt from the precedent");

  const precedent = await prisma.contract.findFirst({
    where: { id: input.precedentContractId, organizationId },
    select: {
      id: true, title: true, type: true, draftText: true, perspective: true,
      clauses: { select: { text: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!precedent) throw new Error("Precedent contract not found");

  const body = (precedent.draftText && precedent.draftText.trim().length > 40)
    ? precedent.draftText
    : precedent.clauses.map((c) => c.text).filter(Boolean).join("\n\n");
  if (!body || body.trim().length < 40) {
    throw new Error("The precedent has no readable body to model from");
  }

  const title = input.title?.trim() || `${precedent.title} (new)`;
  const type = input.type || precedent.type;

  let draftText = "";
  let degraded = true;
  let degradedReason: string | null = null;
  try {
    ensureServerClaudeTransport();
    const prompt = buildPrecedentPrompt(
      { title: precedent.title, type: precedent.type, body, perspective: precedent.perspective },
      input,
    );
    // Plain-text generation (see draftContractWithAI) — avoids the fragile
    // whole-document-in-a-JSON-string round-trip that was silently degrading
    // good drafts to the fallback.
    const raw = await callClaude(prompt, { maxTokens: 4000, timeout: 90000 });
    const t = unwrapDraftText(raw);
    if (t.trim().length > 120) { draftText = t; degraded = false; }
    else degradedReason = "Model returned an empty or too-short draft";
  } catch (e) {
    degradedReason = String((e as Error)?.message || e);
    console.error("[contract-ai-draft] draftFromPrecedent generation failed, copying precedent:", e);
  }
  if (!draftText) {
    draftText = `${title.toUpperCase()}\n\n[Modeled on precedent "${precedent.title}" — AI adaptation was unavailable; this is a copy for the attorney to adapt per the brief.]\n\n${body}`;
  }

  const contract = await createContract(
    organizationId,
    {
      title,
      type,
      status: "DRAFT",
      origin: "OUR_PAPER",
      perspective: input.perspective ?? precedent.perspective ?? "OUR_SIDE",
      draftText,
      counterpartyId: input.counterpartyId ?? null,
      governingLaw: input.governingLaw ?? null,
    },
    actor,
  );

  const extraction = await extractAndPersistContractKnowledge(
    organizationId,
    contract.id,
    draftText,
    contract.type,
    { id: actor.id, type: "USER" },
    { initialSnapshotLabel: degraded ? `Drafted from precedent (fallback copy)` : `Drafted from precedent "${precedent.title}"` },
  );

  return { contractId: contract.id, degraded, clauseCount: extraction.clauses, degradedReason: degraded ? degradedReason : null, precedentContractId: precedent.id };
}
