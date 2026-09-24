import { useState, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Work Feed / Activity (WS-5) — a human-readable reverse-chronological stream
// of what's happening across the workspace, grouped by day. A friendlier lens
// on the same chain-sealed AuditLog that the forensic Audit Log table serves:
// this one reads it as plain-language activity (who · did what · to what ·
// when), the "History" affordance. Reuses GET /api/audit-log (audit:read_all).

const RESOURCE_ICON = {
  Matter: "▣", Contract: "▤", Document: "📄", DataSubjectRequest: "◍",
  LegalHold: "⚖", LegalHoldCustodian: "⚖", IntakeTicket: "◆", Invoice: "▧",
  Vendor: "▧", Role: "◆", User: "◈", RetentionSchedule: "◷", DataTransfer: "↗",
  AiSystem: "◈", PrivacyProcessor: "◍", CookieRecord: "◍", PrivacyTrainingRecord: "◷",
  PrivacyIncident: "▲", PrivacyAssessment: "▥", DataProcessingActivity: "▥",
};
const ACTOR = {
  USER: { glyph: "👤", label: "User", c: C.bl },
  AGENT: { glyph: "🤖", label: "AI Agent", c: C.pp },
  SYSTEM: { glyph: "⚙", label: "System", c: C.t3 },
};

function humanizeAction(action) {
  // "matter.artifact.created" → "matter artifact created"
  return String(action || "").replace(/[._]/g, " ").trim();
}
function relTime(iso) {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function WorkFeedView() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/audit-log?page=1")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setRows(d.rows || []))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!rows) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading activity…</div>;

  const resourceTypes = Array.from(new Set(rows.map((r) => r.resourceType))).sort();
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.resourceType === filter);

  // Group by day (rows already newest-first).
  const groups = [];
  let cur = null;
  for (const r of shown) {
    const label = dayLabel(r.timestamp);
    if (!cur || cur.label !== label) { cur = { label, items: [] }; groups.push(cur); }
    cur.items.push(r);
  }

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.em, textTransform: "uppercase" }}>Intelligence · Activity</div>
        <div style={{ fontSize: 24, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>Everything happening, <em style={{ color: C.em, fontStyle: "italic" }}>as it happens</em></div>
        <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 4 }}>A plain-language stream over the chain-sealed audit ledger — the workspace&apos;s history.</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {["ALL", ...resourceTypes].map((t) => {
          const active = filter === t;
          return (
            <button key={t} type="button" onClick={() => setFilter(t)} style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: M, fontSize: 10, letterSpacing: 0.5, background: active ? C.em : "transparent", color: active ? C.bg : C.t3, border: `1px solid ${active ? C.em : C.br}` }}>{t === "ALL" ? "All" : t}</button>
          );
        })}
      </div>

      {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>No activity recorded.</div>}

      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {g.items.map((r) => {
              const actor = ACTOR[r.actorType] || ACTOR.SYSTEM;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "10px 14px" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">{RESOURCE_ICON[r.resourceType] || "•"}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: actor.c, fontFamily: M, fontSize: 11 }}>{actor.glyph} {actor.label}</span>
                      <span style={{ color: C.t2 }}> · {humanizeAction(r.action)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 2 }}>{r.resourceType}{r.resourceId ? ` · ${String(r.resourceId).slice(0, 12)}` : ""} · #{r.chainPosition}</div>
                  </div>
                  <span style={{ fontSize: 10, color: C.t4, fontFamily: M, flexShrink: 0 }}>{relTime(r.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
