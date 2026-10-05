import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR, inputStyle } from "@aegis/ui";

// ── CW-5 · Cockpit RFI compose dialog ────────────────────────────────
//
// A triage reviewer who needs more from the requester sends a Request For
// Information. The requester answers from "My requests" and triage resumes
// with the answer attached. Reads/writes /api/intake/tickets/[id]/rfi.
// At most one RFI is open per ticket; the backend rejects a second send.

const STATUS_COLOR = { OPEN: C.am, ANSWERED: C.gn, CANCELLED: C.t4 };

function relTime(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function RfiComposeDialog({ ticket, onClose, onDone }) {
  const [rfis, setRfis] = useState(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/rfi`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setRfis(d.rfis || []); })
      .catch(() => {});
  }, [ticket.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openRfi = (rfis || []).find((r) => r.status === "OPEN") || null;

  const submit = useCallback(async () => {
    if (!question.trim()) { setErr("Enter the question you need the requester to answer."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/rfi`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Send failed (HTTP ${r.status})`);
      onDone?.(`⤷ ${ticket.id} — information request sent to the requester`, "am");
      onClose();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }, [question, ticket.id, onDone, onClose]);

  const cancelRfi = useCallback(async (rfiId) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/intake/tickets/${encodeURIComponent(ticket.id)}/rfi/${encodeURIComponent(rfiId)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Cancel failed (HTTP ${r.status})`);
      setBusy(false); load();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }, [ticket.id, load]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", animation: "fu .2s ease", padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderLeft: `3px solid ${C.am}`, borderRadius: 8, padding: 24, maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.am, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>⤷ REQUEST INFO · {ticket.id}</div>
        <div style={{ fontSize: 17, fontFamily: SR, color: C.t1, marginBottom: 4 }}>Ask the requester</div>
        <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginBottom: 14 }}>They answer from “My requests” and triage resumes with it attached. Chain-sealed in the audit log.</div>

        {openRfi ? (
          <div style={{ marginBottom: 12, padding: "11px 13px", background: C.amG, border: `1px solid ${C.am}55`, borderRadius: 5 }}>
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.am, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Awaiting requester</div>
            <div style={{ fontSize: 11.5, color: C.t1, fontFamily: F, lineHeight: 1.5 }}>{openRfi.question}</div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 5 }}>sent {relTime(openRfi.createdAt)} · one open request at a time</div>
            <div onClick={busy ? undefined : () => cancelRfi(openRfi.id)} style={{ marginTop: 8, display: "inline-block", padding: "5px 11px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", borderRadius: 3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Cancel request</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, letterSpacing: .8, marginBottom: 3 }}>Your question</div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} placeholder="What do you need the requester to clarify or provide?" style={{ ...inputStyle, width: "100%", fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
          </>
        )}

        {rfis && rfis.filter((r) => r.status !== "OPEN").length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>History</div>
            {rfis.filter((r) => r.status !== "OPEN").slice(0, 4).map((r) => (
              <div key={r.id} style={{ fontSize: 10, color: C.t3, fontFamily: M, padding: "4px 0", borderBottom: `1px solid ${C.br}33` }}>
                <span style={{ color: STATUS_COLOR[r.status] || C.t3, textTransform: "uppercase", letterSpacing: .5 }}>{r.status}</span> · {r.question.slice(0, 70)}{r.question.length > 70 ? "…" : ""}
                {r.answer ? <div style={{ color: C.t2, marginTop: 2 }}>↳ {r.answer.slice(0, 90)}{r.answer.length > 90 ? "…" : ""}</div> : null}
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ padding: "8px 12px", marginTop: 12, background: C.rdG, borderLeft: `3px solid ${C.rd}`, borderRadius: 4, fontSize: 11, color: C.t1, fontFamily: M }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {!openRfi && (
            <div onClick={busy ? undefined : submit} style={{ flex: 1, textAlign: "center", padding: "9px 14px", background: C.am, color: C.bg, fontSize: 10, fontFamily: M, letterSpacing: 1.5, cursor: busy ? "default" : "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 3, opacity: busy ? .6 : 1 }}>{busy ? "Sending…" : "Send request"}</div>
          )}
          <div onClick={onClose} style={{ padding: "9px 14px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 10, fontFamily: M, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase", borderRadius: 3 }}>{openRfi ? "Close · Esc" : "Cancel · Esc"}</div>
        </div>
      </div>
    </div>
  );
}
