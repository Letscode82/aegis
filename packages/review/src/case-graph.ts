/**
 * CAP-2 — the Case Graph. A directed graph of specialized agents that run over
 * a collection and emit a structured Case Dossier: issue clusters, a timeline,
 * the key entities (people / orgs), a synthesized theory of the case, and the
 * open gaps. Each node is deterministic on its own (so the graph always runs);
 * the theory node calls Claude when configured and degrades otherwise.
 *
 *   Retrieve ─┬─▶ Issue-Cluster ─┐
 *             ├─▶ Timeline ──────┼─▶ Theory ─▶ Gap-Critic ─▶ Dossier
 *             └─▶ Entities ──────┘
 *
 * Read-only — the dossier is analysis, not a mutation. The nodes' outputs are
 * also the raw material the CAP-3 knowledge graph and CAP-4 governed actions
 * build on. Chain-sealed (`reviewset.casegraph.run`).
 */
import { prisma, logAudit } from "@aegis/db";
import { CLAUDE_MODEL, callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { buildCaseBrief, type CaseBrief } from "./copilot";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface GraphNodeStatus { key: string; label: string; status: "done"; outputCount: number }
export interface IssueCluster { key: string; label: string; docCount: number; sampleTitles: string[] }
export interface TimelineFact { date: string | null; label: string; itemId: string }
export interface CaseEntity { name: string; kind: "PERSON" | "ORG"; mentions: number }
export interface DossierKeyDoc { itemId: string; title: string; route: string | null; issues: string[] }
export interface CaseDossier {
  reviewSetId: string;
  brief: CaseBrief;
  theory: string;
  issueClusters: IssueCluster[];
  timeline: TimelineFact[];
  entities: CaseEntity[];
  keyDocuments: DossierKeyDoc[];
  gaps: string[];
  recommendations: string[];
  degraded: boolean;
  model: string | null;
  nodes: GraphNodeStatus[];
}

type Item = { id: string; title: string; excerpt: string | null; aiRoute: string | null; codedResponsive: boolean | null; codedPrivileged: boolean; codingJson: unknown };

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
function liftDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (mdy) return `${mdy[3]}-${String(mdy[1]).padStart(2, "0")}-${String(mdy[2]).padStart(2, "0")}`;
  const named = text.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, "i"));
  if (named) { const d = new Date(`${named[1]} ${named[2]}, ${named[3]} UTC`); return isNaN(+d) ? null : d.toISOString().slice(0, 10); }
  return null;
}

const FREEMAIL = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "aol.com"]);
const STOP_NAME = new Set(["The", "This", "That", "From", "Sent", "Subject", "Re", "Fwd", "Dear", "Best", "Regards", "Attorney", "Client", "Privileged", "Confidential"]);

function issueLabel(key: string, brief: CaseBrief): string {
  return brief.issues.find((i) => i.key === key)?.label ?? key;
}

/** Node: cluster responsive docs by their coded issue codes. */
function clusterIssues(items: Item[], brief: CaseBrief): IssueCluster[] {
  const byIssue = new Map<string, Item[]>();
  for (const it of items) {
    const issues = (it.codingJson as { issues?: string[] } | null)?.issues ?? [];
    for (const k of issues) { if (!byIssue.has(k)) byIssue.set(k, []); byIssue.get(k)!.push(it); }
  }
  return [...byIssue.entries()]
    .map(([key, its]) => ({ key, label: issueLabel(key, brief), docCount: its.length, sampleTitles: its.slice(0, 3).map((i) => i.title) }))
    .sort((a, b) => b.docCount - a.docCount);
}

/** Node: dated facts lifted from responsive documents. */
function extractTimeline(items: Item[]): TimelineFact[] {
  const facts: TimelineFact[] = [];
  for (const it of items) {
    if (it.codedResponsive !== true && it.aiRoute !== "REVIEWER" && it.aiRoute !== "ATTORNEY") continue;
    const date = liftDate(it.title) ?? liftDate(it.excerpt);
    facts.push({ date, label: it.title.slice(0, 140), itemId: it.id });
  }
  return facts.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")).slice(0, 30);
}

/** Node: candidate entities (people via capitalized bigrams; orgs via email domains). */
function extractEntities(items: Item[]): CaseEntity[] {
  const people = new Map<string, number>();
  const orgs = new Map<string, number>();
  for (const it of items) {
    const hay = `${it.title} ${it.excerpt ?? ""}`;
    for (const m of hay.matchAll(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g)) {
      if (STOP_NAME.has(m[1]!) || STOP_NAME.has(m[2]!)) continue;
      const name = `${m[1]} ${m[2]}`;
      people.set(name, (people.get(name) ?? 0) + 1);
    }
    for (const m of hay.matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const dom = m[1]!.toLowerCase();
      if (FREEMAIL.has(dom)) continue;
      const org = dom.split(".")[0]!;
      orgs.set(org, (orgs.get(org) ?? 0) + 1);
    }
  }
  const p: CaseEntity[] = [...people.entries()].filter(([, n]) => n >= 1).map(([name, mentions]) => ({ name, kind: "PERSON" as const, mentions }));
  const o: CaseEntity[] = [...orgs.entries()].map(([name, mentions]) => ({ name, kind: "ORG" as const, mentions }));
  return [...p, ...o].sort((a, b) => b.mentions - a.mentions).slice(0, 15);
}

function keyDocs(items: Item[]): DossierKeyDoc[] {
  return items
    .filter((i) => i.codedResponsive === true || i.aiRoute === "ATTORNEY")
    .slice(0, 12)
    .map((i) => ({ itemId: i.id, title: i.title, route: i.aiRoute, issues: (i.codingJson as { issues?: string[] } | null)?.issues ?? [] }));
}

function findGaps(brief: CaseBrief, clusters: IssueCluster[], timeline: TimelineFact[]): string[] {
  const gaps: string[] = [];
  const clustered = new Set(clusters.map((c) => c.key));
  for (const i of brief.issues) if (!clustered.has(i.key)) gaps.push(`No coded documents yet for issue "${i.label}".`);
  if (brief.counts.collected === 0) gaps.push("Nothing collected — run collection first.");
  if (brief.counts.coded < brief.counts.collected) gaps.push(`${brief.counts.collected - brief.counts.coded} document(s) still pending review.`);
  if (brief.counts.attorney > 0) gaps.push(`${brief.counts.attorney} attorney-routed document(s) need a privilege decision.`);
  if (timeline.filter((t) => t.date).length === 0 && brief.counts.responsive > 0) gaps.push("Responsive documents carry no extractable dates — confirm the chronology manually.");
  return gaps;
}

function deterministicTheory(brief: CaseBrief, clusters: IssueCluster[]): string {
  if (brief.counts.responsive === 0) return `No responsive documents coded yet for ${brief.name}. Code the collection, then re-run the Case Graph for a theory.`;
  const top = clusters.slice(0, 3).map((c) => `${c.label} (${c.docCount} docs)`).join(", ");
  return `Across ${brief.counts.responsive} responsive document(s), the case centers on: ${top || "the collected material"}. ${brief.criteria ? `Scope: ${brief.criteria}` : ""} (Deterministic synthesis — set ANTHROPIC_API_KEY for a narrative theory of the case.)`;
}

async function synthesizeTheory(brief: CaseBrief, clusters: IssueCluster[], docs: DossierKeyDoc[]): Promise<{ theory: string; degraded: boolean; model: string | null }> {
  const fallback = deterministicTheory(brief, clusters);
  if (brief.counts.responsive === 0) return { theory: fallback, degraded: true, model: null };
  try {
    ensureServerClaudeTransport();
    const clusterBlock = clusters.slice(0, 6).map((c) => `- ${c.label}: ${c.docCount} docs (e.g. ${c.sampleTitles.slice(0, 2).join("; ")})`).join("\n");
    const docBlock = docs.slice(0, 10).map((d, i) => `[${i + 1}] ${d.title}`).join("\n");
    const prompt = `You are a litigation strategist. From the review of matter "${brief.name}" (criteria: ${brief.criteria ?? "n/a"}), write a concise THEORY OF THE CASE (4-6 sentences) grounded only in the material below. Note the strongest support and the biggest gap. Do not invent facts.

ISSUE CLUSTERS:
${clusterBlock || "(none)"}

KEY DOCUMENTS:
${docBlock || "(none)"}

Respond as strict JSON: {"theory": string}.`;
    const r = (await callClaudeJSON(prompt, { maxTokens: 700, timeout: 45000 })) as Record<string, unknown>;
    if (r && typeof r.theory === "string" && r.theory.trim()) return { theory: r.theory.trim(), degraded: false, model: CLAUDE_MODEL };
  } catch (e) {
    console.error("[case-graph] theory synthesis failed, using deterministic:", e);
  }
  return { theory: fallback, degraded: true, model: null };
}

export async function runCaseGraph(organizationId: string, reviewSetId: string, actor: Actor): Promise<CaseDossier> {
  const brief = await buildCaseBrief(organizationId, reviewSetId);
  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null },
    select: { id: true, title: true, excerpt: true, aiRoute: true, codedResponsive: true, codedPrivileged: true, codingJson: true },
    orderBy: [{ createdAt: "asc" }],
    take: 2000,
  });

  const issueClusters = clusterIssues(items, brief);
  const timeline = extractTimeline(items);
  const entities = extractEntities(items);
  const keyDocuments = keyDocs(items);
  const { theory, degraded, model } = await synthesizeTheory(brief, issueClusters, keyDocuments);
  const gaps = findGaps(brief, issueClusters, timeline);
  const recommendations = [
    brief.counts.coded < brief.counts.collected ? "Finish coding the pending documents, then re-run the graph." : "Validate the AI review on a sample (Validate tab).",
    timeline.length > 0 ? "Confirm the timeline facts into the chronology (Investigations → Chronology)." : "Draw facts into the chronology as documents are coded.",
    keyDocuments.length > 0 ? "Prepare the production set + privilege log." : "Broaden the collection if responsiveness is low.",
  ];

  const nodes: GraphNodeStatus[] = [
    { key: "retrieve", label: "Retrieve", status: "done", outputCount: items.length },
    { key: "cluster", label: "Issue clusters", status: "done", outputCount: issueClusters.length },
    { key: "timeline", label: "Timeline", status: "done", outputCount: timeline.length },
    { key: "entities", label: "Entities", status: "done", outputCount: entities.length },
    { key: "theory", label: "Theory", status: "done", outputCount: 1 },
    { key: "gaps", label: "Gap critic", status: "done", outputCount: gaps.length },
  ];

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.casegraph.run", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { clusters: issueClusters.length, entities: entities.length, timeline: timeline.length, degraded } as never,
    metadata: { source: "review", channel: "case-graph" } as never,
  });

  return { reviewSetId, brief, theory, issueClusters, timeline, entities, keyDocuments, gaps, recommendations, degraded, model, nodes };
}
