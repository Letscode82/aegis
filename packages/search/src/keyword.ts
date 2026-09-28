/**
 * Keyword search fallback — always available, needs no pgvector and no
 * embedding provider. Scans the Document corpus (name + extracted text) so
 * @aegis/search returns real, grounded results even with zero semantic infra.
 * The semantic path (when configured) supersedes this; this is the floor.
 */
import { prisma } from "@aegis/db";
import type { SearchHit, SemanticSearchInput } from "./types";

/** Excerpt ~`radius` chars around the first occurrence of any term. */
function excerpt(text: string, terms: string[], radius = 160): string {
  const hay = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = hay.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function scoreText(text: string, terms: string[]): number {
  if (!text) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const i = hay.indexOf(t, from);
      if (i < 0) break;
      hits += 1;
      from = i + t.length;
    }
  }
  // Squash into 0..1 — keyword scores are coarse by design.
  return hits === 0 ? 0 : Math.min(1, 0.3 + hits * 0.1);
}

export async function keywordSearch(input: SemanticSearchInput): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(1, input.limit ?? 8), 50);
  const terms = Array.from(
    new Set(
      (input.query || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((t) => t.length >= 3),
    ),
  );
  const wantDocuments = !input.ownerTypes || input.ownerTypes.length === 0 || input.ownerTypes.includes("DOCUMENT");
  if (!wantDocuments || terms.length === 0) return [];

  // OR across terms over name + extractedText. Over-fetch then rank locally.
  const docs = await prisma.document.findMany({
    where: {
      organizationId: input.organizationId,
      OR: terms.flatMap((t) => [
        { name: { contains: t, mode: "insensitive" as const } },
        { extractedText: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    select: { id: true, name: true, extractedText: true, ownerType: true, ownerId: true },
    take: limit * 4,
    orderBy: { uploadedAt: "desc" },
  });

  const hits: SearchHit[] = docs.map((d) => {
    const body = d.extractedText || "";
    const score = Math.max(scoreText(d.name, terms) * 0.8, scoreText(body, terms));
    return {
      ownerType: String(d.ownerType),
      ownerId: d.ownerId,
      documentId: d.id,
      content: body ? excerpt(body, terms) : d.name,
      score,
      source: "keyword" as const,
    };
  });

  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
