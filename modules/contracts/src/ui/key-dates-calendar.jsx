import { useState, useEffect, useCallback, useMemo } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Key-dates calendar (Obligations & Renewals, Phase 2) ─────────────
//
// One month grid + agenda for everything a legal team must not miss: contract
// expiries, non-renewal notice deadlines, and open obligation due dates. Reads
// GET /api/contracts/key-dates; "Export .ics" links to the iCalendar download so
// a GC can subscribe in Outlook / Google Calendar (7-day reminders baked in).

const KIND = {
  CONTRACT_EXPIRY:         { label: "Expiry",          c: C.rd, dot: C.rd },
  RENEWAL_NOTICE_DEADLINE: { label: "Notice deadline", c: C.am, dot: C.am },
  OBLIGATION_DUE:          { label: "Obligation",      c: C.bl, dot: C.bl },
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Kpi({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export function KeyDatesCalendar({ onOpenContract }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(null); // "YYYY-MM-DD"

  const load = useCallback(() => {
    setError(null);
    fetch("/api/contracts/key-dates")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Group events by local calendar day.
  const byDay = useMemo(() => {
    const map = {};
    for (const k of data?.keyDates || []) (map[ymd(new Date(k.date))] ||= []).push(k);
    return map;
  }, [data]);

  // Build the month grid (weeks of Date cells, padded to whole weeks).
  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back up to Sunday
    const cells = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
    const w = [];
    for (let i = 0; i < 6; i++) w.push(cells.slice(i * 7, i * 7 + 7));
    // Drop a trailing all-next-month week for a tidier grid.
    return w.filter((week) => week.some((d) => d.getMonth() === cursor.m));
  }, [cursor]);

  const shiftMonth = (delta) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayKey = ymd(now);

  if (error && !data) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading key dates…</div>;

  const agenda = selected
    ? (byDay[selected] || [])
    : (data.keyDates || []).slice(0, 12); // upcoming-ish (already sorted by date)

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <Kpi label="Key dates" value={data.keyDates.length} />
        <Kpi label="Expiries" value={data.counts.CONTRACT_EXPIRY} color={C.rd} />
        <Kpi label="Notice deadlines" value={data.counts.RENEWAL_NOTICE_DEADLINE} color={C.am} />
        <Kpi label="Obligations" value={data.counts.OBLIGATION_DUE} color={C.bl} />
        <a href="/api/contracts/key-dates/export" style={{ marginLeft: "auto", padding: "8px 13px", background: "transparent", color: C.tl, border: `1px solid ${C.tl}`, borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", textDecoration: "none" }}>⤓ Export .ics</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Calendar */}
        <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>{MONTHS[cursor.m]} {cursor.y}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
              <button onClick={() => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelected(null); }} style={{ ...navBtn, width: "auto", padding: "0 10px", fontSize: 9, letterSpacing: 1 }}>TODAY</button>
              <button onClick={() => shiftMonth(1)} style={navBtn}>›</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: .5, textAlign: "center", padding: "2px 0" }}>{w.toUpperCase()}</div>)}
            {weeks.flat().map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === cursor.m;
              const events = byDay[key] || [];
              const isToday = key === todayKey;
              const isSel = key === selected;
              return (
                <div key={key} onClick={() => setSelected(isSel ? null : key)} style={{ minHeight: 52, borderRadius: 4, padding: "3px 4px", cursor: "pointer", background: isSel ? C.bl + "22" : isToday ? C.tl + "14" : "transparent", border: `1px solid ${isSel ? C.bl : isToday ? C.tl + "66" : C.br + "55"}`, opacity: inMonth ? 1 : .35 }}>
                  <div style={{ fontSize: 10, fontFamily: M, color: isToday ? C.tl : C.t2, fontWeight: isToday ? 700 : 400 }}>{d.getDate()}</div>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 2 }}>
                    {events.slice(0, 4).map((e, i) => <span key={i} title={e.title} style={{ width: 6, height: 6, borderRadius: "50%", background: (KIND[e.kind] || {}).dot || C.t3 }} />)}
                    {events.length > 4 && <span style={{ fontSize: 7, fontFamily: M, color: C.t4 }}>+{events.length - 4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {Object.entries(KIND).map(([k, meta]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontFamily: M, color: C.t3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot }} />{meta.label}</span>)}
          </div>
        </div>

        {/* Agenda */}
        <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
            {selected ? `${selected}` : "Upcoming"}{selected && <span onClick={() => setSelected(null)} style={{ marginLeft: 8, color: C.tl, cursor: "pointer", fontSize: 9 }}>clear</span>}
          </div>
          {agenda.length === 0 ? (
            <div style={{ fontSize: 11, fontFamily: M, color: C.t4, padding: "12px 0" }}>Nothing on this day.</div>
          ) : agenda.map((e) => {
            const meta = KIND[e.kind] || { label: e.kind, c: C.t3 };
            return (
              <div key={e.id} onClick={() => onOpenContract?.(e.contractId)} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.br}33`, cursor: "pointer" }}>
                <span style={{ width: 3, alignSelf: "stretch", background: meta.c, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                  <div style={{ fontSize: 9, fontFamily: M, color: C.t3, marginTop: 2 }}>
                    <span style={{ color: meta.c }}>{meta.label}</span> · {ymd(new Date(e.date))}
                    <span style={{ color: e.daysOut < 0 ? C.rd : e.daysOut <= 30 ? C.am : C.t4 }}> · {e.daysOut < 0 ? `${-e.daysOut}d ago` : `in ${e.daysOut}d`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const navBtn = { width: 26, height: 24, borderRadius: 4, border: `1px solid ${C.br}`, background: "transparent", color: C.t2, fontFamily: M, fontSize: 13, cursor: "pointer", lineHeight: 1 };
