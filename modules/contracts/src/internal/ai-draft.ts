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
import { callClaudeJSON, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
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
}

export interface AiDraftResult {
  contractId: string;
  degraded: boolean;
  clauseCount: number;
}

function buildDraftPrompt(input: AiDraftInput, playbook: Record<string, { standardText: string }>): string {
  const standards = Object.entries(playbook).slice(0, 20).map(([type, e]) => `- ${type}: ${e.standardText.slice(0, 300)}`).join("\n");
  const terms = [
    input.value != null ? `Value: ${input.currency || "USD"} ${input.value}` : null,
    input.paymentTerms ? `Payment terms: ${input.paymentTerms}` : null,
    input.termMonths ? `Term: ${input.termMonths} months` : null,
    input.governingLaw ? `Governing law: ${input.governingLaw}` : null,
  ].filter(Boolean).join("; ");
  return [
    "You are senior in-house counsel drafting a contract ON OUR PAPER (our standard, protective of us).",
    `Draft a complete "${input.type}" titled "${input.title}"${input.counterpartyName ? ` with counterparty "${input.counterpartyName}"` : ""}.`,
    terms ? `Key terms: ${terms}.` : "",
    "",
    "Instructions from the business:",
    input.brief.slice(0, 6000),
    "",
    standards ? `Use OUR standard clause positions where they apply:\n${standards}` : "",
    "",
    "Write a full, well-structured agreement with numbered sections and standard protective clauses (parties, term, payment, confidentiality, IP, liability cap, indemnity, termination, governing law, etc.) as appropriate for the type.",
    "Return STRICT JSON only: {\"draftText\":\"the full contract text with \\n line breaks\"}",
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
  try {
    ensureServerClaudeTransport();
    const prompt = buildDraftPrompt(input, playbook);
    const raw = (await callClaudeJSON(prompt, { maxTokens: 4000, timeout: 90000 })) as Record<string, unknown>;
    const parsed = (typeof raw === "string" ? parseJSONLoose(raw) : raw) as Record<string, unknown>;
    const t = typeof parsed.draftText === "string" ? parsed.draftText : "";
    if (t.trim().length > 120) { draftText = t; degraded = false; }
  } catch (e) {
    console.error("[contract-ai-draft] callClaudeJSON failed, using deterministic skeleton:", e);
  }
  if (!draftText) draftText = fallbackSkeleton(input);

  const contract = await createContract(
    organizationId,
    {
      title: input.title.trim(),
      type: input.type || "Contract",
      status: "DRAFT",
      origin: "OUR_PAPER",
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

  return { contractId: contract.id, degraded, clauseCount: extraction.clauses };
}
