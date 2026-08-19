/**
 * eDiscovery hub — the cross-source Collect & Review dashboard. Every
 * collection across the platform (legal hold, DSAR, and later investigations /
 * ad-hoc culling) in one place, with source, lifecycle stage, and review
 * progress. Opening a collection deep-links to its source workspace (RC-2 adds
 * a unified /review/collections/[id] stage workspace).
 */
import { useState, useEffect, useMemo } from "react";
import { C, F, M, SR } from "@aegis/ui";

const SOURCE = {
  LEGAL_HOLD: { label: "Legal Hold", col: C.bl },
  DSAR: { label: "DSAR", col: C.tl },
  INVESTIGATION: { label: "Investigation", col: C.pp },
  ADHOC: { label: "Ad-hoc", col: C.am },
};
const STAGE = {
  INTAKE: { label: "Intake", col: C.t4 },
  REVIEW: { label: "Review", col: C.bl },
  READY: { label: "Ready", col: C.cy },
  FROZEN: { label: "Frozen", col: C.am },
  PRODUCED: { label: "Produced", col: C.gn },
};

function openHref(c) {
  if (c.origin === "LEGAL_HOLD" && c.matterId && c.legalHoldId) return `/matter/${c.matterId}/holds/${c.legalHoldId}/review`;
  if (c.origin === "DSAR" && c.dataSubjectRequestId) return `/privacy/dsar/${c.dataSubjectRequestId}/review`;
  return null;
}

const badge = (col) => ({ fontSize: 10, fontWeight: 700, letterSpacing: .4, color: col, border: `1px solid ${col}`, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" });

export function EDiscoveryHub() {
  const [rows, setRows] = useState(null);
  const [source, setSource] = useState("ALL");
  const [stage, setStage] = useState("ALL");

  useEffect(() => {
    fetch("/api/review/collections").then((r) => r.json()).then((d) => setRows(d.ok ? d.collections : [])).catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => (rows || []).filter((c) => (source === "ALL" || c.origin === source) && (stage === "ALL" || c.stage === stage)), [rows, source, stage]);
  const counts = useMemo(() => {
    const by = { total: (rows || []).length };
    for (const c of rows || []) by[c.origin] = (by[c.origin] || 0) + 1;
    return by;
  }, [rows]);

  const chip = (active, label, n, col, onClick) => (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer", background: active ? (col ? `${col}22` : C.s1) : "transparent", color: col || C.t1, border: `1px solid ${active ? (col || C.brL) : C.br}`, display: "flex", alignItems: "center", gap: 6 }}>
      {col && <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />}{label}{n != null ? ` ${n}` : ""}
    </button>
  );

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>eDiscovery · one review engine across the platform</div>
      <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Collect &amp; Review</div>
      <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20 }}>Every collection — from legal holds, DSARs, and investigations — flows through one pipeline: Collect → Cull → Review → Produce.</div>

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {chip(source === "ALL", "All sources", counts.total, null, () => setSource("ALL"))}
        {Object.entries(SOURCE).map(([k, v]) => chip(source === k, v.label, counts[k], v.col, () => setSource(k)))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {chip(stage === "ALL", "All stages", null, null, () => setStage("ALL"))}
        {Object.entries(STAGE).map(([k, v]) => chip(stage === k, v.label, null, v.col, () => setStage(k)))}
      </div>

      {/* table */}
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 150px 120px", gap: 0, padding: "10px 18px", background: C.cd, borderBottom: `1px solid ${C.br}`, fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>
          <div>Collection</div><div>Source</div><div>Stage</div><div>Progress</div><div style={{ textAlign: "right" }}>Documents</div>
        </div>
        {rows === null && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>Loading…</div>}
        {rows !== null && filtered.length === 0 && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>No collections match. Start one from a Legal Hold or a DSAR.</div>}
        {filtered.map((c) => {
          const href = openHref(c);
          const s = SOURCE[c.origin] || { label: c.origin, col: C.t3 };
          const st = STAGE[c.stage] || { label: c.stage, col: C.t3 };
          const pct = c.itemCount ? Math.round((c.codedCount / c.itemCount) * 100) : 0;
          return (
            <div key={c.id} onClick={() => href && (window.location.href = href)} style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 150px 120px", gap: 0, padding: "13px 18px", borderBottom: `1px solid ${C.br}44`, alignItems: "center", cursor: href ? "pointer" : "default" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginTop: 2 }}>{c.custodianCount} custodian(s){c.simulated ? " · simulated" : ""}</div>
              </div>
              <div><span style={badge(s.col)}>{s.label}</span></div>
              <div><span style={badge(st.col)}>{st.label}</span></div>
              <div>
                <div style={{ height: 6, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, overflow: "hidden", width: 110 }}><div style={{ width: `${pct}%`, height: "100%", background: C.bl }} /></div>
                <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginTop: 3 }}>{c.codedCount}/{c.itemCount} coded</div>
              </div>
              <div style={{ textAlign: "right", fontFamily: M, fontSize: 14, color: C.t2 }}>{c.itemCount}{href && <span style={{ color: C.cy, marginLeft: 8 }}>→</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
