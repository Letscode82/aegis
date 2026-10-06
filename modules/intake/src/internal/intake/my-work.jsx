import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, Card, Pill } from "@aegis/ui";

// ── W1-1 · My Work — the personal work inbox (issue #103) ────────────
//
// One screen per person: agent recommendations awaiting my review, the
// tickets on my plate (assigned to me / baton held by me), and my open
// sub-tasks. SLA-aware ordering from the server. Every row deep-links
// into the ticket via onOpenTicket. Skeleton-loaded, teaching empty
// state — the "zero-training" landing surface for legal staff.

const prColor = (p) => p === "Critical" ? C.rd : p === "High" ? C.am : p === "Medium" ? C.bl : C.t3;
const slaColor = (s) => /overdue|breach/i.test(s || "") ? C.rd : /risk/i.test(s || "") ? C.am : C.gn;
const sectionLabel = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 };

function Skeleton() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ height: 46, background: C.s1, borderRadius: 5, marginBottom: 7, opacity: .5 - i * .12, animation: "fu 1s ease infinite alternate" }} />
      ))}
    </div>
  );
}

function Row({ onClick, children, accent }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.s1, border: `1px solid ${C.br}`, borderLeft: `3px solid ${accent || C.br}`, borderRadius: 5, marginBottom: 6, cursor: "pointer", transition: "all .12s" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.cy; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.br; e.currentTarget.style.borderLeftColor = accent || C.br; }}>
      {children}
    </div>
  );
}

export function MyWorkTab({ onOpenTicket, userName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/intake/my-work");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setData(d); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <Card style={{ borderLeft: `3px solid ${C.rd}` }}><div style={{ fontSize: 12, color: C.t2, fontFamily: F }}>Couldn't load your work: {err}</div></Card>;

  const total = data?.counts?.total ?? null;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontFamily: SR, color: C.t1 }}>
          {userName ? `${userName.split(" ")[0]}'s` : "My"} work
          {total !== null && <span style={{ fontSize: 12, fontFamily: M, color: total > 0 ? C.am : C.gn, marginLeft: 10 }}>{total > 0 ? `${total} item${total === 1 ? "" : "s"} waiting` : "all clear"}</span>}
        </div>
        <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>Everything waiting on you — reviews, tickets, tasks — ordered by urgency.</div>
      </div>

      {data === null ? <Skeleton /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, maxWidth: 900 }}>

          {/* Reviews awaiting me — the human gate, front and center */}
          <div>
            <div style={sectionLabel}>◉ Awaiting my review ({data.reviews.length})</div>
            {data.reviews.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, padding: "2px 0 4px" }}>No agent recommendations waiting on you.</div>}
            {data.reviews.map((r) => (
              <Row key={`${r.ticketId}-${r.agentId}`} onClick={() => onOpenTicket(r.ticketId)} accent={C.am}>
                <span style={{ fontSize: 10, fontFamily: M, color: C.pp }}>🤖</span>
                <span style={{ fontSize: 10.5, fontFamily: M, color: C.cy, fontWeight: 600 }}>{r.ticketId}</span>
                <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{r.ticketType} — agent draft ready for your review</span>
                <Pill t={r.priority} c={prColor(r.priority)} />
                <span style={{ fontSize: 9.5, fontFamily: M, color: slaColor(r.slaStatus) }}>{r.slaStatus}</span>
              </Row>
            ))}
          </div>

          {/* My tickets */}
          <div>
            <div style={sectionLabel}>◈ My tickets ({data.tickets.length})</div>
            {data.tickets.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, padding: "2px 0 4px" }}>Nothing assigned to you right now.</div>}
            {data.tickets.map((t) => (
              <Row key={t.id} onClick={() => onOpenTicket(t.id)} accent={slaColor(t.slaStatus)}>
                <span style={{ fontSize: 10.5, fontFamily: M, color: C.cy, fontWeight: 600 }}>{t.id}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.type} · {t.descSnippet}</div>
                  <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 1 }}>
                    stage: {t.stage}{t.workStatus ? ` · ${t.workStatus}` : ""}{t.holding && !t.assigned ? " · baton passed to you" : ""}
                  </div>
                </div>
                <Pill t={t.priority} c={prColor(t.priority)} />
                <span style={{ fontSize: 9.5, fontFamily: M, color: slaColor(t.slaStatus), whiteSpace: "nowrap" }}>{t.slaStatus}</span>
              </Row>
            ))}
          </div>

          {/* My tasks */}
          <div>
            <div style={sectionLabel}>☑ My tasks ({data.tasks.length})</div>
            {data.tasks.length === 0 && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, padding: "2px 0 4px" }}>No open tasks assigned to you.</div>}
            {data.tasks.map((t) => (
              <Row key={t.id} onClick={() => onOpenTicket(t.ticketId)} accent={t.status === "blocked" ? C.rd : C.bl}>
                <span style={{ fontSize: 8.5, fontFamily: M, color: t.status === "blocked" ? C.rd : C.bl, letterSpacing: .5, textTransform: "uppercase", border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>{t.status.replace("_", " ")}</span>
                <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{t.title}</span>
                <span style={{ fontSize: 9.5, fontFamily: M, color: C.t3 }}>{t.ticketId} · {t.ticketType}</span>
              </Row>
            ))}
          </div>

          {total === 0 && (
            <Card style={{ background: C.gnG, borderLeft: `3px solid ${C.gn}`, textAlign: "center", padding: 26 }}>
              <div style={{ fontSize: 20, fontFamily: SR, color: C.t1, marginBottom: 4 }}>Inbox zero 🎉</div>
              <div style={{ fontSize: 11, color: C.t2, fontFamily: F }}>Nothing waiting on you. Check the Cockpit queue to pick up unassigned work.</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
