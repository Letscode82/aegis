/**
 * Entity-level cross-linking (K3) — the "one brain" join.
 *
 * Answers "everything about <counterparty>", "what contracts do we have with
 * <company>", "matters involving <party>" by resolving the named counterparty
 * and gathering its linked records across modules (matters + contracts today)
 * — the shared-entity join the platform is built around.
 *
 * Precise + best-effort: it only fires when the question names a proper noun
 * after a linking preposition AND that name resolves to a real Counterparty in
 * the org. Otherwise it returns null and the caller falls through to the
 * operational / document paths — so it never degrades existing answers. Each
 * section is permission-gated (canUserDo). Server-side only.
 */
import { prisma } from "@aegis/db";
import { canUserDo, Permission, type AuthUser } from "@aegis/auth";
import { getMattersByCounterparty, listLegalHolds } from "@aegis/matter";
import { getSpendOverview } from "@aegis/spend";

const LIST_CAP = 25;
// A proper-noun candidate right after a linking preposition.
const CANDIDATE_RE = /\b(?:about|regarding|involving|related to|with|for|on|against)\s+([A-Z][\w&.'-]*(?:\s+[A-Z0-9][\w&.'-]*){0,4})/g;
const STOP = new Set(["the", "a", "an", "me", "us", "them", "it", "this", "that", "our", "my"]);

/** Cheap gate: is this plausibly an entity cross-link question? */
export function looksLikeEntityLookup(question: string): boolean {
  CANDIDATE_RE.lastIndex = 0;
  return CANDIDATE_RE.test(question || "");
}

/** Extract up to a few proper-noun candidates after linking prepositions. */
function extractCandidates(question: string): string[] {
  const out: string[] = [];
  CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANDIDATE_RE.exec(question || "")) !== null) {
    const g = m[1];
    if (!g) continue;
    const cand = g.replace(/[?.,;:]+$/, "").trim();
    if (cand.length >= 2 && !STOP.has(cand.toLowerCase())) out.push(cand);
    if (out.length >= 4) break;
  }
  return out;
}

export interface EntityCrossLink {
  text: string;
  matched: string;
  nav: Array<{ label: string; view: string }>;
}

/**
 * Resolve a counterparty named in the question and gather its cross-module
 * links. Returns null when nothing resolves (caller falls through).
 */
export async function getEntityCrossLink(user: AuthUser, question: string): Promise<EntityCrossLink | null> {
  const orgId = user.organizationId;
  const candidates = extractCandidates(question);
  if (candidates.length === 0) return null;

  // Resolve the first candidate that matches a real counterparty.
  let cp: { id: string; name: string; type: string } | null = null;
  for (const cand of candidates) {
    try {
      const hit = await prisma.counterparty.findFirst({
        where: { organizationId: orgId, name: { contains: cand, mode: "insensitive" } },
        select: { id: true, name: true, type: true },
      });
      if (hit) { cp = { id: hit.id, name: hit.name, type: String(hit.type) }; break; }
    } catch { /* try next candidate */ }
  }
  if (!cp) return null;

  const parts: string[] = [`COUNTERPARTY — ${cp.name} (${cp.type}).`];
  const nav: Array<{ label: string; view: string }> = [];
  const matterIds = new Set<string>();

  if (canUserDo(user, Permission.MatterReadAll).allowed) {
    try {
      const matters = await getMattersByCounterparty(cp.id);
      for (const m of matters) { const id = (m as Record<string, unknown>).id; if (typeof id === "string") matterIds.add(id); }
      const list = matters.slice(0, LIST_CAP).map((m) => {
        const mm = m as Record<string, unknown>;
        return `${mm.matterNumber ? mm.matterNumber + " · " : ""}${mm.title ?? "Matter"} (${mm.status ?? "?"})`;
      });
      parts.push(`Matters (${matters.length}): ${list.join("; ") || "none"}${matters.length > LIST_CAP ? "; …" : ""}.`);
      if (matters.length) nav.push({ label: "Matters", view: "matters" });
    } catch { /* omit */ }

    // Legal holds on this counterparty's matters.
    if (matterIds.size > 0) {
      try {
        const holds = ((await listLegalHolds(orgId)) as Array<Record<string, unknown>>).filter((h) => {
          const mid = (h.matterId as string) || ((h.matter as Record<string, unknown> | undefined)?.id as string);
          return mid && matterIds.has(mid);
        });
        if (holds.length) {
          const list = holds.slice(0, LIST_CAP).map((h) => `${h.title ?? h.holdNumber ?? h.id ?? "Hold"} (${h.status ?? "?"})`);
          parts.push(`Legal holds (${holds.length}): ${list.join("; ")}${holds.length > LIST_CAP ? "; …" : ""}.`);
        }
      } catch { /* omit */ }
    }
  }

  if (canUserDo(user, Permission.ContractsReadAll).allowed) {
    try {
      const contracts = await prisma.contract.findMany({
        where: { organizationId: orgId, counterpartyId: cp.id },
        select: { title: true, status: true },
        orderBy: { statusChangedAt: "desc" },
        take: LIST_CAP,
      });
      const total = await prisma.contract.count({ where: { organizationId: orgId, counterpartyId: cp.id } });
      const list = contracts.map((c) => `${c.title} (${c.status})`);
      parts.push(`Contracts (${total}): ${list.join("; ") || "none"}${total > contracts.length ? "; …" : ""}.`);
      if (total) nav.push({ label: "Contracts", view: "contracts" });
    } catch { /* omit */ }
  }

  // Spend on this counterparty's matters (invoices link to matter, not the
  // counterparty directly, so we join through the matter set).
  if (matterIds.size > 0 && canUserDo(user, Permission.SpendReadAll).allowed) {
    try {
      const ov = await getSpendOverview(orgId);
      const invoices = (ov.invoices || []).filter((inv) => inv.matterId && matterIds.has(inv.matterId));
      if (invoices.length) {
        const billed = Math.round(invoices.reduce((n, inv) => n + (inv.amount || 0), 0) * 100) / 100;
        parts.push(`Spend: ${invoices.length} invoice(s), $${billed} across these matters.`);
        nav.push({ label: "Legal Spend", view: "spend" });
      }
    } catch { /* omit */ }
  }

  // Only meaningful if at least one linked section was readable.
  if (parts.length === 1) return null;
  return { text: parts.join("\n"), matched: cp.name, nav };
}
