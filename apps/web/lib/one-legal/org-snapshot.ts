/**
 * Cross-module operational snapshot (K2) — the "one brain" answers.
 *
 * ONE Legal's document Q&A can't answer operational questions ("how many
 * intake tickets?", "which matters have legal holds?", "what contracts are
 * open?", cross-module counts) because those live in structured module data,
 * not documents. This builds a compact, permission-scoped snapshot of live
 * figures across the modules, which the /ask path feeds to Claude as grounding
 * so it can answer from real numbers and cross-link.
 *
 * Read-only + best-effort: each section is gated by the caller's read
 * permission (via canUserDo, non-throwing) and wrapped in try/catch, so a
 * missing grant or a read error simply omits that section. Server-side only.
 */
import { prisma } from "@aegis/db";
import { canUserDo, Permission, type AuthUser } from "@aegis/auth";
import { getContractsOverview } from "@aegis/contracts";
import { getSpendOverview } from "@aegis/spend";
import { listLegalHolds } from "@aegis/matter";

const LIST_CAP = 20;

function countsLine(rows: Array<{ status: string; _count: { _all: number } }>): { total: number; by: string } {
  const total = rows.reduce((n, r) => n + r._count._all, 0);
  const by = rows.map((r) => `${r.status}: ${r._count._all}`).join(", ") || "none";
  return { total, by };
}

/**
 * Build a text digest of the org's operational figures, scoped to what the
 * user may read. Returns { text, sections } — `text` is grounding for Claude,
 * `sections` names what was included (for observability).
 */
export async function getOrgSnapshot(user: AuthUser): Promise<{ text: string; sections: string[] }> {
  const orgId = user.organizationId;
  const parts: string[] = [];
  const sections: string[] = [];
  const can = (p: Permission) => canUserDo(user, p).allowed;

  // Intake tickets
  if (can(Permission.IntakeReadAllTickets)) {
    try {
      const rows = await prisma.intakeTicket.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: { _all: true } });
      const { total, by } = countsLine(rows as never);
      parts.push(`LEGAL INTAKE — ${total} ticket(s). By status: ${by}.`);
      sections.push("intake");
    } catch { /* omit */ }
  }

  // Matters
  if (can(Permission.MatterReadAll)) {
    try {
      const rows = await prisma.matter.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: { _all: true } });
      const { total, by } = countsLine(rows as never);
      // Include the actual matter list (names) so "what are the matters" answers
      // with names, not just a count.
      const matters = await prisma.matter.findMany({
        where: { organizationId: orgId },
        select: { matterNumber: true, title: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: LIST_CAP,
      });
      const list = matters.map((m) => `${m.matterNumber ? m.matterNumber + " · " : ""}${m.title} (${m.status})`).join("; ");
      parts.push(`MATTERS — ${total} matter(s). By status: ${by}.` + (list ? ` Matters: ${list}${total > matters.length ? "; …" : ""}.` : ""));
      sections.push("matters");
    } catch { /* omit */ }

    // Legal holds (+ which matters they're on)
    try {
      const holds = (await listLegalHolds(orgId)) as Array<Record<string, unknown>>;
      const byStatus: Record<string, number> = {};
      const lines: string[] = [];
      for (const h of holds) {
        const status = String(h.status ?? "UNKNOWN");
        byStatus[status] = (byStatus[status] || 0) + 1;
        const label = String(h.title ?? h.name ?? h.holdNumber ?? h.id ?? "Hold");
        const matter = h.matter as Record<string, unknown> | undefined;
        const matterTitle = matter ? String(matter.title ?? matter.matterNumber ?? "") : String(h.matterTitle ?? "");
        lines.push(`${label}${matterTitle ? ` (matter: ${matterTitle})` : ""} — ${status}`);
      }
      const by = Object.entries(byStatus).map(([s, n]) => `${s}: ${n}`).join(", ") || "none";
      parts.push(
        `LEGAL HOLDS — ${holds.length} hold(s). By status: ${by}.` +
          (lines.length ? ` Holds: ${lines.slice(0, LIST_CAP).join("; ")}${lines.length > LIST_CAP ? "; …" : ""}.` : ""),
      );
      sections.push("legal-holds");
    } catch { /* omit */ }
  }

  // Contracts
  if (can(Permission.ContractsReadAll)) {
    try {
      const ov = await getContractsOverview(orgId);
      const by = Object.entries(ov.byStatus || {}).map(([s, n]) => `${s}: ${n}`).join(", ") || "none";
      // "Open" = live (ACTIVE/EXECUTED) or in-flight (DRAFT/IN_REVIEW/IN_NEGOTIATION/APPROVED).
      const OPEN = new Set(["ACTIVE", "EXECUTED", "DRAFT", "IN_REVIEW", "IN_NEGOTIATION", "APPROVED"]);
      const open = (ov.contracts || []).filter((c) => OPEN.has(String(c.status)));
      const list = open.slice(0, LIST_CAP).map((c) => `${c.title}${c.counterpartyName ? ` — ${c.counterpartyName}` : ""} (${c.status})`).join("; ");
      parts.push(
        `CONTRACTS — ${ov.totals.total} total; ${ov.totals.active} active, ${ov.totals.inFlight} in-flight, ` +
          `${ov.totals.highRisk} high-risk, ${ov.totals.expiringSoon} expiring within 90 days. By status: ${by}. ` +
          `Obligations: ${ov.totals.openObligations} open, ${ov.totals.overdueObligations} overdue.` +
          (list ? ` Open contracts: ${list}${open.length > LIST_CAP ? "; …" : ""}.` : ""),
      );
      sections.push("contracts");
    } catch { /* omit */ }
  }

  // Spend
  if (can(Permission.SpendReadAll)) {
    try {
      const ov = await getSpendOverview(orgId);
      const by = Object.entries(ov.byStatus || {}).map(([s, n]) => `${s}: ${n}`).join(", ") || "none";
      parts.push(
        `LEGAL SPEND — ${ov.totals.invoiceCount} invoice(s), ${ov.totals.inReviewCount} in review; ` +
          `$${ov.totals.totalBilled} billed, budget $${ov.totals.budgetSpent}/${ov.totals.budgetAllocated}. By status: ${by}.`,
      );
      sections.push("spend");
    } catch { /* omit */ }
  }

  // Privacy / DSAR
  if (can(Permission.PrivacyDsarRead)) {
    try {
      const rows = await prisma.dataSubjectRequest.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: { _all: true } });
      const { total, by } = countsLine(rows as never);
      parts.push(`PRIVACY / DSAR — ${total} request(s). By status: ${by}.`);
      sections.push("privacy");
    } catch { /* omit */ }
  }

  return { text: parts.join("\n"), sections };
}

// Operational-question detector: an aggregate/list/status intent about a
// module noun. Precise enough to avoid firing on generic document questions.
const AGG_INTENT = /\b(how many|how much|count|number of|list|what are|what'?s|which|show|any|open|pending|overdue|outstanding|active|status|breakdown|summary|overview|total|due)\b/i;
const MODULE_NOUN = /\b(intake|ticket|matter|legal hold|holds?|custodian|contract|invoice|spend|budget|dsar|privacy|obligation|renewal|vendor|counterpart|case)\b/i;

export function looksOperational(question: string): boolean {
  const q = question || "";
  return AGG_INTENT.test(q) && MODULE_NOUN.test(q);
}

// Map module nouns in a question to console nav targets, so an operational
// answer can offer "Open <module> →" jumps to the underlying data.
const NAV_MATCHERS: Array<{ re: RegExp; label: string; view: string }> = [
  { re: /\b(intake|ticket)/i, label: "Legal Intake", view: "intake" },
  { re: /\b(legal hold|holds?|custodian)/i, label: "Legal Holds", view: "matters" },
  { re: /\b(matter|case)/i, label: "Matters", view: "matters" },
  { re: /\b(contract|obligation|renewal)/i, label: "Contracts", view: "contracts" },
  { re: /\b(spend|invoice|budget|vendor)/i, label: "Legal Spend", view: "spend" },
  { re: /\b(dsar|privacy)/i, label: "Privacy", view: "privacy" },
];

export function operationalNav(question: string): Array<{ label: string; view: string }> {
  const q = question || "";
  const out: Array<{ label: string; view: string }> = [];
  const seen = new Set<string>();
  for (const m of NAV_MATCHERS) {
    if (m.re.test(q) && !seen.has(m.view)) {
      seen.add(m.view);
      out.push({ label: m.label, view: m.view });
    }
  }
  return out;
}
