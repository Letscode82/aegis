/**
 * MatterSpaceHome (WS-2 + WS-4) — the Harvey/Legora-style "Space" landing
 * for a matter. One console that composes the matter's workstreams and now
 * carries the scoped assistant:
 *   - "Ask AEGIS about this Space" — Ask mode routes the question through the
 *     matter-scoped assistant (WS-4) and can save the answer as an Artifact;
 *     File mode files an intake request (WS-1 pipeline). Scope toggle:
 *     This Space / Org / Web.
 *   - Workstream cards (Tasks · Legal Holds · Spend · Team · Timeline).
 *   - Artifacts gallery (AI-generated drafts saved to the matter).
 *   - Recent-activity strip (the matter timeline).
 *
 * Reuses existing endpoints + the WS-4 /ask and /artifacts routes. Artifacts
 * are the shared Document entity — no new table.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Card, C, F, M, SR } from "@aegis/ui";
import type { MatterDTO } from "./types";

type TabKey = "overview" | "team" | "tasks" | "timeline" | "hold" | "spend" | "audit" | "m365";

interface Counts {
  tasksOpen: number;
  tasksTotal: number;
  holds: number;
  parties: number;
  events: number;
  budgetPct: number | null;
  budgetLabel: string | null;
}

const money = (n: number) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

const SCOPES: Array<{ id: string; label: string }> = [
  { id: "space", label: "This Space" },
  { id: "org", label: "Org knowledge" },
  { id: "web", label: "General" },
];

export const MatterSpaceHome: React.FC<{
  matter: MatterDTO;
  matterId: string;
  onNavigateTab: (tab: TabKey) => void;
}> = ({ matter, matterId, onNavigateTab }) => {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; label: string; at: string }>>([]);

  // Assistant state
  const [mode, setMode] = useState<"ask" | "file">("ask");
  const [scope, setScope] = useState("space");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerDegraded, setAnswerDegraded] = useState(false);
  const [fileResult, setFileResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savingArtifact, setSavingArtifact] = useState(false);

  // Artifacts
  const [artifacts, setArtifacts] = useState<Array<{ id: string; name: string; createdAt: string; preview: string }>>([]);
  const [viewArtifact, setViewArtifact] = useState<{ name: string; content: string } | null>(null);

  const loadArtifacts = useCallback(() => {
    fetch(`/api/matter/${matterId}/artifacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setArtifacts(d && d.ok ? d.items : []))
      .catch(() => setArtifacts([]));
  }, [matterId]);

  useEffect(() => {
    let alive = true;
    async function j(url: string) {
      try {
        const r = await fetch(url);
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    }
    Promise.all([
      j(`/api/matter/${matterId}/tasks`),
      j(`/api/matter/${matterId}/holds`),
      j(`/api/matter/${matterId}/parties`),
      j(`/api/matter/${matterId}/timeline`),
      j(`/api/matter/${matterId}/cost-basis`),
    ]).then(([tasks, holds, parties, timeline, cost]) => {
      if (!alive) return;
      const taskArr: Array<{ status?: string; completedAt?: string | null }> = Array.isArray(tasks) ? tasks : tasks?.tasks || [];
      const holdArr = Array.isArray(holds) ? holds : holds?.holds || [];
      const partyArr = Array.isArray(parties) ? parties : parties?.parties || [];
      const evtArr: Array<{ id?: string; label?: string; title?: string; type?: string; at?: string; occurredAt?: string; createdAt?: string }> =
        Array.isArray(timeline) ? timeline : timeline?.entries || timeline?.timeline || [];
      const allocated = cost?.budgetAllocated ?? cost?.allocated ?? null;
      const spent = cost?.budgetSpent ?? cost?.spent ?? null;
      setCounts({
        tasksOpen: taskArr.filter((t) => !t.completedAt && t.status !== "DONE" && t.status !== "COMPLETE").length,
        tasksTotal: taskArr.length,
        holds: holdArr.length,
        parties: partyArr.length,
        events: evtArr.length,
        budgetPct: allocated && allocated > 0 && spent != null ? Math.round((spent / allocated) * 100) : null,
        budgetLabel: allocated && allocated > 0 ? `${money(spent ?? 0)} / ${money(allocated)}` : null,
      });
      setRecent(
        evtArr.slice(0, 6).map((e, i) => ({
          id: e.id || String(i),
          label: e.label || e.title || (e.type ? e.type.replace(/_/g, " ") : "Event"),
          at: (e.at || e.occurredAt || e.createdAt || "").slice(0, 10),
        })),
      );
    });
    loadArtifacts();
    return () => {
      alive = false;
    };
  }, [matterId, loadArtifacts]);

  const submit = async () => {
    const t = input.trim();
    if (t.length < 3 || busy) return;
    setBusy(true);
    setErr(null);
    setAnswer(null);
    setFileResult(null);
    try {
      if (mode === "ask") {
        const r = await fetch(`/api/matter/${matterId}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: t, scope }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setAnswer(d.answer);
        setAnswerDegraded(!!d.degraded);
      } else {
        const scoped = `[Matter: ${matter.matterNumber ?? matter.title}] ${t}`;
        const r = await fetch("/api/intake/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: scoped }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setFileResult(`Filed ${d.ticketId} → routed to ${d.classification.team} (${d.classification.priority})`);
        setInput("");
      }
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const saveArtifact = async () => {
    if (!answer || savingArtifact) return;
    setSavingArtifact(true);
    setErr(null);
    try {
      const name = input.trim().slice(0, 80) || "AI draft";
      const r = await fetch(`/api/matter/${matterId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content: answer, sourcePrompt: input.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAnswer(null);
      setInput("");
      loadArtifacts();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setSavingArtifact(false);
    }
  };

  const openArtifact = async (id: string) => {
    try {
      const r = await fetch(`/api/matter/${matterId}/artifacts/${id}`);
      const d = await r.json();
      if (r.ok && d.ok) setViewArtifact({ name: d.artifact.name, content: d.artifact.content });
    } catch {
      /* ignore */
    }
  };

  const cards: Array<{ key: TabKey; label: string; value: string; sub: string; color?: string }> = [
    { key: "tasks", label: "Tasks", value: counts ? `${counts.tasksOpen}` : "—", sub: counts ? `${counts.tasksOpen} open · ${counts.tasksTotal} total` : "open tasks", color: counts && counts.tasksOpen > 0 ? C.am : C.gn },
    { key: "hold", label: "Legal Holds", value: counts ? `${counts.holds}` : "—", sub: "on this matter", color: C.bl },
    { key: "spend", label: "Spend", value: counts && counts.budgetPct != null ? `${counts.budgetPct}%` : "—", sub: counts?.budgetLabel || "budget vs actual", color: C.tl },
    { key: "team", label: "Team", value: counts ? `${counts.parties}` : "—", sub: "parties & counsel", color: C.pp },
    { key: "timeline", label: "Timeline", value: counts ? `${counts.events}` : "—", sub: "recorded events", color: C.t2 },
  ];

  const modeTab = (id: "ask" | "file", label: string) => (
    <button
      type="button"
      onClick={() => { setMode(id); setAnswer(null); setFileResult(null); setErr(null); }}
      style={{ background: mode === id ? C.tl : "transparent", color: mode === id ? C.bg : C.t3, border: `1px solid ${mode === id ? C.tl : C.br}`, borderRadius: 20, padding: "4px 12px", fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600, cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {/* Scoped assistant */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, minWidth: 0 }}>
            Ask AEGIS about <em style={{ color: C.tl, fontStyle: "italic" }}>{matter.title}</em>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{modeTab("ask", "Ask")}{modeTab("file", "File request")}</div>
        </div>

        {mode === "ask" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {SCOPES.map((s) => (
              <button key={s.id} type="button" onClick={() => setScope(s.id)} style={{ background: scope === s.id ? C.s1 : "transparent", color: scope === s.id ? C.t1 : C.t4, border: `1px solid ${scope === s.id ? C.tl : C.br}`, borderRadius: 5, padding: "3px 10px", fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, cursor: "pointer" }}>{s.label}</button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={mode === "ask" ? "Ask a question · draft a clause · summarize the risk…" : "Draft an NDA · flag a dispute · review a vendor…"}
            aria-label="Ask AEGIS about this matter"
            style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "9px 11px", outline: "none" }}
          />
          <button type="button" onClick={submit} disabled={busy || input.trim().length < 3} style={{ background: C.tl, color: C.bg, border: "none", borderRadius: 6, padding: "9px 16px", fontFamily: M, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy || input.trim().length < 3 ? 0.6 : 1, flexShrink: 0 }}>
            {busy ? (mode === "ask" ? "Thinking…" : "Routing…") : mode === "ask" ? "Ask ⏎" : "Route ⏎"}
          </button>
        </div>

        {fileResult && <div style={{ fontSize: 11.5, color: C.gn, fontFamily: M, marginTop: 8 }}>✓ {fileResult}</div>}
        {err && <div style={{ fontSize: 11.5, color: C.rd, fontFamily: M, marginTop: 8 }}>⚠ {err}</div>}

        {answer && (
          <div style={{ marginTop: 12, border: `1px solid ${C.br}`, borderRadius: 8, background: C.bg, overflow: "hidden" }}>
            {answerDegraded && <div style={{ padding: "6px 12px", background: C.amG, fontSize: 9.5, fontFamily: M, color: C.am, letterSpacing: 0.5 }}>AI not configured — showing guidance</div>}
            <div style={{ padding: "12px 14px", fontSize: 12.5, color: C.t1, lineHeight: 1.55, whiteSpace: "pre-wrap", maxHeight: 340, overflowY: "auto" }}>{answer}</div>
            {!answerDegraded && (
              <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.br}` }}>
                <button type="button" onClick={saveArtifact} disabled={savingArtifact} style={{ background: C.gn, color: C.bg, border: "none", borderRadius: 5, padding: "6px 12px", fontFamily: M, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, cursor: savingArtifact ? "default" : "pointer", opacity: savingArtifact ? 0.6 : 1 }}>💾 Save as artifact</button>
                <button type="button" onClick={() => setAnswer(null)} style={{ background: "transparent", color: C.t3, border: `1px solid ${C.br}`, borderRadius: 5, padding: "6px 12px", fontFamily: M, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", cursor: "pointer" }}>Clear</button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Workstream cards */}
      <div>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Workstreams</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {cards.map((c) => (
            <div key={c.key} onClick={() => onNavigateTab(c.key)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onNavigateTab(c.key); }} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>{c.label}</div>
              <div style={{ fontSize: 26, fontFamily: SR, color: c.color || C.t1, marginTop: 4, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 10, color: C.t3, fontFamily: M, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Artifacts gallery */}
      <Card>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Artifacts · {artifacts.length}</div>
        {artifacts.length === 0 ? (
          <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>No artifacts yet. Ask AEGIS above, then “Save as artifact”.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {artifacts.map((a) => (
              <div key={a.id} onClick={() => openArtifact(a.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openArtifact(a.id); }} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 13px", cursor: "pointer", minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {a.name}</div>
                <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 2 }}>{a.createdAt.slice(0, 10)}</div>
                <div style={{ fontSize: 10.5, color: C.t3, marginTop: 6, lineHeight: 1.4, maxHeight: 52, overflow: "hidden" }}>{a.preview}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent activity */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase" }}>Recent activity</div>
          <button type="button" onClick={() => onNavigateTab("timeline")} style={{ background: "transparent", border: "none", color: C.t3, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>View all →</button>
        </div>
        {recent.length === 0 && <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>No activity recorded yet.</div>}
        <div style={{ display: "grid", gap: 6 }}>
          {recent.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, padding: "5px 0", borderBottom: `1px solid ${C.br}33` }}>
              <span style={{ color: C.t2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
              <span style={{ color: C.t4, fontFamily: M, fontSize: 10, flexShrink: 0 }}>{e.at}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Artifact viewer */}
      {viewArtifact && (
        <div onClick={() => setViewArtifact(null)} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 720, maxHeight: "86vh", overflowY: "auto", fontFamily: F, color: C.t1 }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15, fontFamily: SR }}>📄 {viewArtifact.name}</span>
              <button type="button" onClick={() => setViewArtifact(null)} style={{ background: "transparent", border: `1px solid ${C.br}`, color: C.t2, borderRadius: 5, padding: "5px 12px", fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>Close</button>
            </div>
            <div style={{ padding: "16px 18px", fontSize: 12.5, color: C.t1, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{viewArtifact.content}</div>
          </div>
        </div>
      )}
    </div>
  );
};
