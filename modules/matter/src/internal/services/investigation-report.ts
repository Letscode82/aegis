/**
 * INV-4 — investigation findings report. Assembles the investigation into a
 * single defensible document: summary + issues + chronology + key documents +
 * gaps + recommended next steps, with a Markdown rendering. Pure read over the
 * investigation, its chronology (CaseFact), and the coded documents of its
 * review sets. Deterministic — the report reflects exactly what's in the record.
 */
import { prisma } from "@aegis/db";
import { getInvestigationService } from "./investigation";
import { listChronologyService, type CaseFactDTO } from "./chronology";

export interface ReportKeyDoc { title: string; sourceQuote: string | null; issues: string[] }
export interface InvestigationReport {
  matterId: string;
  matterTitle: string;
  matterNumber: string | null;
  summary: string;
  issues: Array<{ key: string; label: string }>;
  chronology: CaseFactDTO[];
  keyDocuments: ReportKeyDoc[];
  stats: { collected: number; coded: number; responsive: number; privileged: number };
  gaps: string[];
  recommendations: string[];
  markdown: string;
}

function renderMarkdown(r: Omit<InvestigationReport, "markdown">): string {
  const lines: string[] = [];
  lines.push(`# Findings Report — ${r.matterTitle}`);
  if (r.matterNumber) lines.push(`_Matter ${r.matterNumber}_`);
  lines.push("");
  lines.push("## Summary");
  lines.push(r.summary);
  lines.push("");
  lines.push("## Issues under investigation");
  for (const i of r.issues) lines.push(`- **${i.label}** (\`${i.key}\`)`);
  lines.push("");
  lines.push("## Chronology");
  if (r.chronology.length === 0) lines.push("_No facts recorded yet._");
  for (const f of r.chronology) {
    const date = f.occurredOn ? new Date(f.occurredOn).toISOString().slice(0, 10) : "undated";
    lines.push(`- **${date}** — ${f.label}${f.sourceQuote ? ` _(“${f.sourceQuote.slice(0, 160)}”)_` : ""}`);
  }
  lines.push("");
  lines.push("## Key documents");
  if (r.keyDocuments.length === 0) lines.push("_No responsive documents coded yet._");
  for (const d of r.keyDocuments) lines.push(`- ${d.title}${d.issues.length ? ` [${d.issues.join(", ")}]` : ""}`);
  lines.push("");
  lines.push("## Evidence posture");
  lines.push(`- Collected: ${r.stats.collected} · Coded: ${r.stats.coded} · Responsive: ${r.stats.responsive} · Privileged: ${r.stats.privileged}`);
  lines.push("");
  lines.push("## Open questions & gaps");
  if (r.gaps.length === 0) lines.push("_None identified._");
  for (const g of r.gaps) lines.push(`- ${g}`);
  lines.push("");
  lines.push("## Recommended next steps");
  for (const s of r.recommendations) lines.push(`- ${s}`);
  lines.push("");
  return lines.join("\n");
}

export async function buildInvestigationReportService(organizationId: string, matterId: string): Promise<InvestigationReport> {
  const inv = await getInvestigationService(organizationId, matterId);
  if (!inv) throw new Error("Investigation not found");
  const chronology = await listChronologyService(organizationId, matterId);

  const sets = await prisma.reviewSet.findMany({ where: { organizationId, matterId }, select: { id: true } });
  const setIds = sets.map((s) => s.id);
  const items = setIds.length
    ? await prisma.reviewSetItem.findMany({ where: { reviewSetId: { in: setIds } }, select: { title: true, excerpt: true, codingJson: true, reviewDecision: true, codedResponsive: true, codedPrivileged: true, excludedAt: true } })
    : [];

  const collected = items.length;
  const coded = items.filter((i) => i.reviewDecision !== "PENDING").length;
  const responsive = items.filter((i) => i.codedResponsive === true).length;
  const privileged = items.filter((i) => i.codedPrivileged === true).length;

  const keyDocuments: ReportKeyDoc[] = items
    .filter((i) => i.codedResponsive === true && i.excludedAt == null)
    .slice(0, 12)
    .map((i) => ({ title: (i.title || "Document").slice(0, 160), sourceQuote: i.excerpt ? i.excerpt.slice(0, 200) : null, issues: (i.codingJson as { issues?: string[] } | null)?.issues ?? [] }));

  // Deterministic gaps.
  const gaps: string[] = [];
  const factIssueKeys = new Set(chronology.flatMap((f) => f.issueKeys));
  for (const i of inv.issues) if (!factIssueKeys.has(i.key)) gaps.push(`No chronology fact yet for issue "${i.label}".`);
  if (collected === 0) gaps.push("No documents collected — run preserve & collect from the investigation.");
  const pending = collected - coded;
  if (pending > 0) gaps.push(`${pending} collected document(s) still pending review.`);
  if (responsive > 0 && chronology.length === 0) gaps.push("Responsive documents exist but no facts have been drawn into the chronology.");

  const recommendations: string[] = [
    collected === 0 ? "Preserve and collect from the identified custodians." : "Complete coding of the remaining collected documents.",
    chronology.length === 0 ? "Draw facts from the responsive documents into the chronology." : "Validate the chronology against the source documents.",
    "Interview the key custodians identified in the plan.",
    responsive > 0 ? "Prepare the production set and privilege log." : "Broaden the collection scope if responsiveness is low.",
  ];

  const summary = `${inv.matterTitle}. ${inv.sourceText.slice(0, 400)}${inv.sourceText.length > 400 ? "…" : ""} ${responsive} responsive document(s) identified across ${collected} collected; ${chronology.length} fact(s) in the chronology.`;

  const base: Omit<InvestigationReport, "markdown"> = {
    matterId, matterTitle: inv.matterTitle, matterNumber: inv.matterNumber,
    summary, issues: inv.issues, chronology, keyDocuments,
    stats: { collected, coded, responsive, privileged }, gaps, recommendations,
  };
  return { ...base, markdown: renderMarkdown(base) };
}
