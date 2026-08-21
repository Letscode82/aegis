/**
 * DossierPanel (CAP-2) — runs the Case Graph and renders the Case Dossier: the
 * agent DAG (nodes light up as they finish), the synthesized theory of the
 * case, issue clusters, a timeline, key entities, key documents, and the open
 * gaps. Read-only analysis produced by a graph of agents over the collection.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, M, SR } from "@aegis/ui";

interface Cluster { key: string; label: string; docCount: number; sampleTitles: string[] }
interface Fact { date: string | null; label: string; itemId: string }
interface Entity { name: string; kind: "PERSON" | "ORG"; mentions: number }
interface KeyDoc { itemId: string; title: string; route: string | null; issues: string[] }
interface Node { key: string; label: string; status: string; outputCount: number }
interface Dossier {
  theory: string; issueClusters: Cluster[]; timeline: Fact[]; entities: Entity[];
  keyDocuments: KeyDoc[]; gaps: string[]; recommendations: string[]; degraded: boolean; model: string | null; nodes: Node[];
}
export interface DossierPanelProps { apiBase: string; reviewSetId: string }

export const DossierPanel: React.FC<DossierPanelProps> = ({ apiBase, reviewSetId }) => {
  const [d, setD] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/case-graph`, { method: "POST" });
      const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setD(j.dossier);
    } catch (e) { setErr(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const section = (title: string, body: React.ReactNode) => (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.t3, marginBottom: 12 }}>{title}</div>
      {body}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.pp, textTransform: "uppercase" }}>Case Graph · agent dossier</div>
            <div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>Solve the case</div>
          </div>
          <button onClick={run} disabled={busy} style={{ padding: "10px 18px", background: C.pp, color: C.bg, border: "none", borderRadius: 8, fontFamily: M, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Running agents…" : d ? "Re-run Case Graph" : "▶ Run Case Graph"}</button>
        </div>
        {err && <div style={{ fontSize: 12.5, color: C.rd, marginBottom: 12 }}>{err}</div>}

        <AgentActions apiBase={apiBase} reviewSetId={reviewSetId} />

        {!d && !busy && <div style={{ padding: 30, textAlign: "center", color: C.t4, border: `1px dashed ${C.br}`, borderRadius: 12, fontSize: 13 }}>Run the Case Graph to have a chain of agents read the collection and assemble the case: theory, issue clusters, timeline, entities, and gaps.</div>}

        {d && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Agent DAG */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 4px" }}>
              {d.nodes.map((n, i) => (
                <React.Fragment key={n.key}>
                  {i > 0 && <span style={{ color: C.t4 }}>→</span>}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.gn}`, background: `${C.gn}12`, borderRadius: 20, padding: "5px 11px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gn }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>{n.label}</span>
                    <span style={{ fontFamily: M, fontSize: 10.5, color: C.t4 }}>{n.outputCount}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {section("Theory of the case", <>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: C.t1, whiteSpace: "pre-wrap" }}>{d.theory}</div>
              <div style={{ marginTop: 8, fontSize: 10, fontFamily: M, color: C.t4 }}>{d.degraded ? "deterministic (no model key)" : `Claude${d.model ? ` · ${d.model}` : ""}`}</div>
            </>)}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {section(`Issue clusters (${d.issueClusters.length})`, d.issueClusters.length === 0 ? <span style={{ fontSize: 12, color: C.t4 }}>None — code documents by issue.</span> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.issueClusters.map((c) => (
                    <div key={c.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ fontWeight: 600 }}>{c.label}</span><span style={{ fontFamily: M, color: C.t3 }}>{c.docCount}</span></div>
                      <div style={{ fontSize: 11, color: C.t4 }}>{c.sampleTitles.slice(0, 2).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              ))}
              {section(`Entities (${d.entities.length})`, d.entities.length === 0 ? <span style={{ fontSize: 12, color: C.t4 }}>None found.</span> : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {d.entities.map((e) => (
                    <span key={e.name} style={{ fontSize: 12, border: `1px solid ${e.kind === "PERSON" ? C.bl : C.am}`, color: e.kind === "PERSON" ? C.bl : C.am, borderRadius: 6, padding: "3px 8px" }}>{e.name} <span style={{ fontFamily: M, opacity: .7 }}>{e.mentions}</span></span>
                  ))}
                </div>
              ))}
            </div>

            {section(`Timeline (${d.timeline.length})`, d.timeline.length === 0 ? <span style={{ fontSize: 12, color: C.t4 }}>No dated facts extracted.</span> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {d.timeline.slice(0, 12).map((f) => (
                  <div key={f.itemId} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, fontSize: 12.5 }}>
                    <span style={{ fontFamily: M, color: f.date ? C.t2 : C.t4 }}>{f.date ?? "undated"}</span>
                    <span style={{ color: C.t1 }}>{f.label}</span>
                  </div>
                ))}
              </div>
            ))}

            {section(`Open gaps (${d.gaps.length})`, d.gaps.length === 0 ? <span style={{ fontSize: 12, color: C.gn }}>No gaps identified.</span> : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.t2, lineHeight: 1.7 }}>{d.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            ))}

            {section("Recommended next steps", (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.t2, lineHeight: 1.7 }}>{d.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface Proposal { id: string; kind: string; description: string; count: number; status: string; approvedByName?: string | null }

/** CAP-4 — governed agent actions: the agent PROPOSES, a human APPROVES, and
 *  only the approve keystroke executes + chain-seals. */
const AgentActions: React.FC<{ apiBase: string; reviewSetId: string }> = ({ apiBase, reviewSetId }) => {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    fetch(`${apiBase}/${reviewSetId}/agent-actions`).then((r) => r.json()).then((d) => { if (d.ok) setRows(d.proposals); }).catch(() => {});
  }, [apiBase, reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const propose = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/agent-actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "code-reviewer-responsive" }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      load();
    } catch (e) { setMsg(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/review/agent-decisions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      load();
    } catch (e) { setMsg(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const pending = rows.filter((p) => p.status === "PENDING");
  return (
    <div style={{ border: `1px solid ${C.pp}55`, background: `${C.pp}0d`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.pp }}>Agent actions · governed</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>The agent proposes; a human approves. Nothing is applied until you approve — and the approval is chain-sealed.</div>
        </div>
        <button onClick={propose} disabled={busy} style={{ fontSize: 12, fontWeight: 600, padding: "8px 13px", borderRadius: 7, cursor: "pointer", background: "transparent", color: C.pp, border: `1px solid ${C.pp}` }}>Propose: tag reviewer-routed as responsive</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.rd, marginTop: 8 }}>{msg}</div>}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.slice(0, 6).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${C.br}`, borderRadius: 8, padding: "8px 11px", background: C.bg }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.t1 }}>{p.description}</div>
                <div style={{ fontSize: 10.5, fontFamily: M, color: C.t4 }}>{p.status}{p.approvedByName ? ` · ${p.approvedByName}` : ""}</div>
              </div>
              {p.status === "PENDING" ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => decide(p.id, "approve")} disabled={busy} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer", background: C.gn, color: C.bg, border: "none" }}>Approve</button>
                  <button onClick={() => decide(p.id, "reject")} disabled={busy} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 6, cursor: "pointer", background: "transparent", color: C.rd, border: `1px solid ${C.rd}` }}>Reject</button>
                </div>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: p.status === "APPROVED" ? C.gn : C.t4, border: `1px solid ${p.status === "APPROVED" ? C.gn : C.t4}`, borderRadius: 5, padding: "2px 8px" }}>{p.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {pending.length === 0 && rows.length === 0 && <div style={{ fontSize: 11.5, color: C.t4, marginTop: 8 }}>No proposals yet.</div>}
    </div>
  );
};
