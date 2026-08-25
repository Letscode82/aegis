/**
 * ECA-2 service — theme clustering over a collection, with optional Claude
 * labels. Deterministic TF-IDF clustering (clustering.ts) always runs; when a
 * model key is configured, one cheap Claude pass names the themes. Degrades to
 * the deterministic top-terms label with no key. Read-only.
 */
import { prisma } from "@aegis/db";
import { CLAUDE_MODEL, callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { clusterDocuments, type DocCluster } from "./clustering";

export interface EcaClustersResult {
  clusters: DocCluster[];
  total: number;
  degraded: boolean;
  model: string | null;
}

export async function getReviewSetClusters(organizationId: string, reviewSetId: string): Promise<EcaClustersResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true, name: true } });
  if (!rs) throw new Error("Review set not found");

  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null },
    select: { id: true, title: true, excerpt: true },
    take: 2000,
    orderBy: [{ createdAt: "asc" }],
  });
  const clusters = clusterDocuments(items.map((i) => ({ id: i.id, title: i.title, excerpt: i.excerpt })));

  // Optional: name the themes with Claude. Best-effort; deterministic labels
  // stand if the model isn't configured or the call fails.
  let degraded = true;
  let model: string | null = null;
  const nameable = clusters.filter((c) => c.id !== "cluster-uncategorized" && c.topTerms.length > 0);
  if (nameable.length > 0) {
    try {
      ensureServerClaudeTransport();
      const sampleTitles = new Map(
        nameable.map((c) => [c.id, itemTitlesForCluster(items, c).slice(0, 4)]),
      );
      const block = nameable
        .map((c) => `${c.id}: terms=[${c.topTerms.join(", ")}] examples=[${(sampleTitles.get(c.id) ?? []).join(" | ")}]`)
        .join("\n");
      const prompt = `You are labeling document clusters from a legal eDiscovery collection named "${rs.name}".
For each cluster below, give a short 2-4 word human theme label (Title Case, no punctuation).
CLUSTERS:
${block}

Respond as strict JSON: {"labels": {"<cluster-id>": "<short label>"}}.`;
      const r = (await callClaudeJSON(prompt, { maxTokens: 500, timeout: 30000 })) as { labels?: Record<string, unknown> };
      const labels = r?.labels ?? {};
      let applied = 0;
      for (const c of nameable) {
        const l = labels[c.id];
        if (typeof l === "string" && l.trim()) { c.label = l.trim().slice(0, 60); applied += 1; }
      }
      if (applied > 0) { degraded = false; model = CLAUDE_MODEL; }
    } catch (e) {
      console.error("[eca-clusters] Claude labeling failed, using deterministic labels:", e);
    }
  }

  return { clusters, total: items.length, degraded, model };
}

function itemTitlesForCluster(items: Array<{ id: string; title: string }>, c: DocCluster): string[] {
  const ids = new Set(c.docIds);
  const out: string[] = [];
  for (const it of items) { if (ids.has(it.id)) { out.push(it.title); if (out.length >= 4) break; } }
  return out;
}
