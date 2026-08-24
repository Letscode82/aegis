/**
 * CopilotPanel (CAP-1) — the Case Copilot chat. Ask a case question; the
 * copilot answers grounded in the collection's documents and CITES them
 * (click a citation to see the source). A Case Brief header keeps the case in
 * view; suggested next steps are surfaced but never auto-executed (read-only —
 * the action gate lands in CAP-4). Live Claude when configured; a deterministic
 * extractive answer otherwise.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { DossierPanel } from "./DossierPanel";
import { KnowledgeGraphPanel } from "./KnowledgeGraphPanel";
import { AutoPilotPanel } from "./AutoPilotPanel";

interface Brief {
  name: string; origin: string; criteria: string | null;
  issues: Array<{ key: string; label: string }>;
  counts: { collected: number; coded: number; responsive: number; privileged: number; attorney: number };
  keyDocuments: Array<{ id: string; title: string }>;
}
interface Citation { itemId: string; title: string; excerpt: string | null }
interface Turn { role: "user" | "assistant"; content: string; citations?: Citation[]; degraded?: boolean; model?: string | null }

export interface CopilotPanelProps { apiBase: string; reviewSetId: string; canMutate?: boolean }

const STARTERS = [
  "Summarize this case and the key facts.",
  "What are the strongest responsive documents?",
  "Are there any privilege concerns?",
  "Who are the key people involved?",
];

export const CopilotPanel: React.FC<CopilotPanelProps> = ({ apiBase, reviewSetId, canMutate = true }) => {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"ask" | "autopilot" | "graph" | "map">("ask");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${apiBase}/${reviewSetId}/copilot`).then((r) => r.json()).then((d) => { if (d.ok) setBrief(d.brief); }).catch(() => {});
  }, [apiBase, reviewSetId]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [turns, busy]);

  const ask = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setErr(""); setQ("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/copilot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setTurns((prev) => [...prev, { role: "assistant", content: d.answer, citations: d.citations, degraded: d.degraded, model: d.model }]);
    } catch (e) { setErr(String((e as Error).message || e)); setTurns((prev) => prev.slice(0, -1)); } finally { setBusy(false); }
  }, [apiBase, reviewSetId, turns, busy]);

  const renderAnswer = (t: Turn) => {
    // Turn [n] citation markers into little chips.
    const parts = t.content.split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(\d+)\]$/);
      if (m && t.citations && t.citations[Number(m[1]) - 1]) {
        return <span key={i} title={t.citations[Number(m[1]) - 1]?.title} style={{ display: "inline-flex", fontFamily: M, fontSize: 10.5, fontWeight: 600, color: C.cy, border: `1px solid ${C.cy}`, borderRadius: 4, padding: "0 4px", margin: "0 2px" }}>{p}</span>;
      }
      return <React.Fragment key={i}>{p}</React.Fragment>;
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Case brief header */}
      <div style={{ borderBottom: `1px solid ${C.br}`, padding: "14px 22px", background: C.cd }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: 1.2, color: C.pp, textTransform: "uppercase", marginBottom: 3 }}>Case Copilot{brief ? ` · ${brief.origin}` : ""}</div>
          <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 8, padding: 3, border: `1px solid ${C.br}` }}>
            {(["ask", "autopilot", "graph", "map"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, cursor: "pointer", border: "none", background: tab === t ? C.pp : "transparent", color: tab === t ? C.bg : C.t3 }}>{t === "ask" ? "Ask" : t === "autopilot" ? "AutoPilot" : t === "graph" ? "Case Graph" : "Map"}</button>
            ))}
          </div>
        </div>
        {brief ? (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
            <div style={{ fontFamily: SR, fontSize: 17, fontWeight: 600 }}>{brief.name}</div>
            <div style={{ fontSize: 11.5, color: C.t3, fontFamily: M }}>{brief.counts.collected} collected · {brief.counts.responsive} responsive · {brief.counts.privileged} privileged · {brief.counts.attorney} attorney-routed</div>
            {brief.issues.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{brief.issues.slice(0, 5).map((i) => <span key={i.key} style={{ fontSize: 9.5, color: C.pp, border: `1px solid ${C.pp}`, borderRadius: 4, padding: "1px 6px" }}>{i.label}</span>)}</div>}
          </div>
        ) : <div style={{ fontSize: 12, color: C.t4 }}>Loading case brief…</div>}
      </div>

      {tab === "graph" ? <DossierPanel apiBase={apiBase} reviewSetId={reviewSetId} /> : tab === "map" ? <KnowledgeGraphPanel apiBase={apiBase} reviewSetId={reviewSetId} /> : tab === "autopilot" ? <AutoPilotPanel apiBase={apiBase} reviewSetId={reviewSetId} canMutate={canMutate} /> : (
      <>
      {/* Transcript */}
      <div ref={scroller} style={{ flex: 1, overflow: "auto", padding: "20px 22px", minHeight: 0 }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {turns.length === 0 && (
            <div style={{ color: C.t3 }}>
              <div style={{ fontSize: 13.5, marginBottom: 14 }}>Ask about this collection — every answer cites the documents it used.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} style={{ fontSize: 12.5, padding: "8px 13px", borderRadius: 20, cursor: "pointer", background: "transparent", color: C.t2, border: `1px solid ${C.br}` }}>{s}</button>)}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: t.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "88%", background: t.role === "user" ? C.bl : C.cd, color: t.role === "user" ? C.bg : C.t1, border: t.role === "user" ? "none" : `1px solid ${C.br}`, borderRadius: 12, padding: "12px 15px" }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t.role === "assistant" ? renderAnswer(t) : t.content}</div>
                {t.role === "assistant" && t.citations && t.citations.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${C.br}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 9.5, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: C.t4 }}>Sources</div>
                    {t.citations.map((c, ci) => (
                      <div key={c.itemId} style={{ fontSize: 11.5, color: C.t3 }}><span style={{ fontFamily: M, color: C.cy }}>[{ci + 1}]</span> {c.title}</div>
                    ))}
                  </div>
                )}
                {t.role === "assistant" && (
                  <div style={{ marginTop: 8, fontSize: 10, fontFamily: M, color: C.t4 }}>{t.degraded ? "deterministic (no model key)" : `Claude${t.model ? ` · ${t.model}` : ""}`}</div>
                )}
              </div>
            </div>
          ))}
          {busy && <div style={{ fontSize: 12.5, color: C.t4, fontFamily: M }}>Reasoning over the collection…</div>}
        </div>
      </div>

      {/* Suggestions + composer */}
      <div style={{ borderTop: `1px solid ${C.br}`, padding: "12px 22px", background: C.cd }}>
        {err && <div style={{ fontSize: 12, color: C.rd, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 820, margin: "0 auto" }}>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} rows={1} placeholder="Ask about this case…" style={{ flex: 1, resize: "none", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 10, color: C.t1, fontFamily: F, fontSize: 13.5, padding: "11px 13px", outline: "none" }} />
          <button disabled={busy || !q.trim()} onClick={() => ask(q)} style={{ padding: "11px 18px", background: C.pp, color: C.bg, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Ask</button>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
