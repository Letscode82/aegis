/**
 * KnowledgeGraphPanel (CAP-3) — the Case Knowledge Graph. People, orgs, and
 * issues the agents extracted, laid out on concentric rings (issues at the
 * centre, people around them, orgs outside), with edges weighted by shared
 * documents. Hover a node to light up its connections. Read-only exploration
 * of "who is connected to what" — the interactive map the Case Graph builds.
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, M, SR } from "@aegis/ui";

interface Node { kind: "PERSON" | "ORG" | "ISSUE"; label: string; weight: number }
interface Edge { fromLabel: string; toLabel: string; kind: string; weight: number }
export interface KnowledgeGraphPanelProps { apiBase: string; reviewSetId: string }

const KIND_COLOR: Record<string, string> = { PERSON: "#6B8EC4", ORG: "#E0B34A", ISSUE: "#9B7FC7" };

export const KnowledgeGraphPanel: React.FC<KnowledgeGraphPanelProps> = ({ apiBase, reviewSetId }) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/${reviewSetId}/knowledge-graph`).then((r) => r.json()).then((d) => { if (d.ok) { setNodes(d.graph.nodes); setEdges(d.graph.edges); } }).catch(() => {});
  }, [apiBase, reviewSetId]);

  const materialize = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/knowledge-graph`, { method: "POST" });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNodes(d.graph.nodes); setEdges(d.graph.edges);
    } catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const W = 760, H = 520, cx = W / 2, cy = H / 2;
  const pos = useMemo(() => {
    const rings: Record<string, number> = { ISSUE: 70, PERSON: 165, ORG: 245 };
    const byKind: Record<string, Node[]> = { ISSUE: [], PERSON: [], ORG: [] };
    for (const n of nodes) (byKind[n.kind] ?? byKind.PERSON!).push(n);
    const p = new Map<string, { x: number; y: number; r: number; kind: string }>();
    for (const kind of ["ISSUE", "PERSON", "ORG"]) {
      const list = byKind[kind]!;
      list.forEach((n, i) => {
        const ang = list.length === 1 ? -Math.PI / 2 : (i / list.length) * Math.PI * 2 - Math.PI / 2;
        const ring = rings[kind]!;
        p.set(n.label, { x: cx + ring * Math.cos(ang), y: cy + ring * Math.sin(ang), r: Math.min(18, 6 + Math.sqrt(n.weight) * 2.2), kind });
      });
    }
    return p;
  }, [nodes]);

  const neighbors = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const e of edges) { if (e.fromLabel === hover) set.add(e.toLabel); if (e.toLabel === hover) set.add(e.fromLabel); }
    return set;
  }, [hover, edges]);

  const maxW = Math.max(1, ...edges.map((e) => e.weight));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.pp, textTransform: "uppercase" }}>Case knowledge graph</div>
            <div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>Who is connected to what</div>
          </div>
          <button onClick={materialize} disabled={busy} style={{ padding: "10px 18px", background: C.pp, color: C.bg, border: "none", borderRadius: 8, fontFamily: M, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Building graph…" : nodes.length ? "Rebuild graph" : "▶ Build knowledge graph"}</button>
        </div>
        {err && <div style={{ fontSize: 12.5, color: C.rd, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: C.t3, marginBottom: 10 }}>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: KIND_COLOR.PERSON, marginRight: 5 }} />People</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: KIND_COLOR.ORG, marginRight: 5 }} />Orgs</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: KIND_COLOR.ISSUE, marginRight: 5 }} />Issues</span>
        </div>

        {nodes.length === 0 && !busy && <div style={{ padding: 30, textAlign: "center", color: C.t4, border: `1px dashed ${C.br}`, borderRadius: 12, fontSize: 13 }}>Build the knowledge graph to map the people, organizations, and issues across the collection and how they connect.</div>}

        {nodes.length > 0 && (
          <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, overflow: "hidden", background: C.bg }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {edges.map((e, i) => {
                const a = pos.get(e.fromLabel), b = pos.get(e.toLabel);
                if (!a || !b) return null;
                const active = !neighbors || (neighbors.has(e.fromLabel) && neighbors.has(e.toLabel));
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.t2} strokeOpacity={active ? 0.12 + 0.5 * (e.weight / maxW) : 0.04} strokeWidth={active ? 0.6 + 1.6 * (e.weight / maxW) : 0.5} />;
              })}
              {nodes.map((n) => {
                const p = pos.get(n.label); if (!p) return null;
                const active = !neighbors || neighbors.has(n.label);
                return (
                  <g key={n.label} style={{ cursor: "pointer" }} opacity={active ? 1 : 0.25}
                     onMouseEnter={() => setHover(n.label)} onMouseLeave={() => setHover(null)}>
                    <circle cx={p.x} cy={p.y} r={p.r} fill={KIND_COLOR[n.kind]} stroke={C.bg} strokeWidth={1.5} />
                    {(active || n.weight >= 3) && <text x={p.x} y={p.y - p.r - 4} textAnchor="middle" fontSize={10.5} fontFamily="var(--M, monospace)" fill={C.t2}>{n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        {nodes.length > 0 && <div style={{ fontSize: 11, color: C.t4, marginTop: 8 }}>{nodes.length} entities · {edges.length} connections · hover a node to highlight its links.</div>}
      </div>
    </div>
  );
};
