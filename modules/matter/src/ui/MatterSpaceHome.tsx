/**
 * MatterSpaceHome (WS-2) — the Harvey/Legora-style "Space" landing for a
 * matter. One console that composes the matter's workstreams:
 *   - a scoped "Ask AEGIS about this matter" prompt that files an intake
 *     request tagged with the matter (routes through the same intake
 *     pipeline as the global command bar);
 *   - a grid of workstream cards (Tasks · Legal Holds · Spend · Team ·
 *     Timeline) with live counts, each jumping to its tab — the AEGIS
 *     analog of Harvey's "Vaults";
 *   - a recent-activity strip (the matter timeline).
 *
 * Read-only composition over existing matter endpoints — no new API, no
 * schema. Mounts as the default "Home" tab of the matter detail view.
 */
import React, { useEffect, useState } from "react";
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

export const MatterSpaceHome: React.FC<{
  matter: MatterDTO;
  matterId: string;
  onNavigateTab: (tab: TabKey) => void;
}> = ({ matter, matterId, onNavigateTab }) => {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; label: string; at: string }>>([]);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<string | null>(null);
  const [askErr, setAskErr] = useState<string | null>(null);

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
    return () => {
      alive = false;
    };
  }, [matterId]);

  const submitAsk = async () => {
    const t = ask.trim();
    if (t.length < 3 || asking) return;
    setAsking(true);
    setAskErr(null);
    setAskResult(null);
    try {
      const scoped = `[Matter: ${matter.matterNumber ?? matter.title}] ${t}`;
      const r = await fetch("/api/intake/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scoped }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAskResult(`Filed ${d.ticketId} → routed to ${d.classification.team} (${d.classification.priority})`);
      setAsk("");
    } catch (e) {
      setAskErr(String((e as Error).message || e));
    } finally {
      setAsking(false);
    }
  };

  const cards: Array<{ key: TabKey; label: string; value: string; sub: string; color?: string }> = [
    { key: "tasks", label: "Tasks", value: counts ? `${counts.tasksOpen}` : "—", sub: counts ? `${counts.tasksOpen} open · ${counts.tasksTotal} total` : "open tasks", color: counts && counts.tasksOpen > 0 ? C.am : C.gn },
    { key: "hold", label: "Legal Holds", value: counts ? `${counts.holds}` : "—", sub: "on this matter", color: C.bl },
    { key: "spend", label: "Spend", value: counts && counts.budgetPct != null ? `${counts.budgetPct}%` : "—", sub: counts?.budgetLabel || "budget vs actual", color: C.tl },
    { key: "team", label: "Team", value: counts ? `${counts.parties}` : "—", sub: "parties & counsel", color: C.pp },
    { key: "timeline", label: "Timeline", value: counts ? `${counts.events}` : "—", sub: "recorded events", color: C.t2 },
  ];

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {/* Scoped ask */}
      <Card>
        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase" }}>Ask AEGIS</div>
        <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, marginTop: 2, marginBottom: 10 }}>
          Ask AEGIS anything about <em style={{ color: C.tl, fontStyle: "italic" }}>{matter.title}</em>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitAsk(); }}
            placeholder="Draft an NDA · flag a dispute · review a vendor · file a request for this matter…"
            aria-label="Ask AEGIS about this matter"
            style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "9px 11px", outline: "none" }}
          />
          <button type="button" onClick={submitAsk} disabled={asking || ask.trim().length < 3} style={{ background: C.tl, color: C.bg, border: "none", borderRadius: 6, padding: "9px 16px", fontFamily: M, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, cursor: asking ? "default" : "pointer", opacity: asking || ask.trim().length < 3 ? 0.6 : 1, flexShrink: 0 }}>
            {asking ? "Routing…" : "Ask ⏎"}
          </button>
        </div>
        {askResult && <div style={{ fontSize: 11.5, color: C.gn, fontFamily: M, marginTop: 8 }}>✓ {askResult}</div>}
        {askErr && <div style={{ fontSize: 11.5, color: C.rd, fontFamily: M, marginTop: 8 }}>⚠ {askErr}</div>}
      </Card>

      {/* Workstream cards (Vaults analog) */}
      <div>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Workstreams</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {cards.map((c) => (
            <div
              key={c.key}
              onClick={() => onNavigateTab(c.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onNavigateTab(c.key); }}
              style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", minWidth: 0 }}
            >
              <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>{c.label}</div>
              <div style={{ fontSize: 26, fontFamily: SR, color: c.color || C.t1, marginTop: 4, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 10, color: C.t3, fontFamily: M, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity (History) */}
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
    </div>
  );
};
