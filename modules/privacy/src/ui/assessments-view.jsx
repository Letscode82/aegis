import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Privacy Assessments (PIA / DPIA / TIA / LIA / AI / vendor). List + a
// questionnaire modal that scores risk live and runs the DRAFT → IN_REVIEW
// → APPROVED/REJECTED lifecycle (approval gated privacy:dpia:approve).

const TYPES = [
  { id: "PIA", label: "PIA (screen)" }, { id: "DPIA", label: "DPIA" }, { id: "TIA", label: "Transfer (TIA)" },
  { id: "LIA", label: "Legitimate interest (LIA)" }, { id: "AI", label: "AI / ADM" }, { id: "VENDOR", label: "Vendor" },
];
const RISK = { LOW: C.gn, MEDIUM: C.am, HIGH: C.or || C.am, SEVERE: C.rd };
const STATUS = { DRAFT: C.t3, IN_REVIEW: C.bl, APPROVED: C.gn, REJECTED: C.rd };
const pill = (col) => ({ fontSize: 9, fontFamily: M, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" });

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function DetailModal({ id, onClose, onChanged }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mit, setMit] = useState("");

  const load = useCallback(() => {
    api(`/api/privacy/assessments/${id}`).then((d) => setA(d.assessment)).catch((e) => setErr(String(e.message || e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const editable = a && (a.status === "DRAFT" || a.status === "IN_REVIEW");

  const setAnswer = async (qid, val) => {
    const answers = a.answers.map((x) => (x.questionId === qid ? { ...x, answer: val } : x));
    setA({ ...a, answers });
    try { const d = await api(`/api/privacy/assessments/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) }); setA(d.assessment); if (onChanged) onChanged(); }
    catch (e) { setErr(String(e.message || e)); }
  };
  const addMitigation = async () => {
    if (!mit.trim()) return;
    const mitigations = [...a.mitigations, { text: mit.trim(), done: false }];
    setMit("");
    try { const d = await api(`/api/privacy/assessments/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mitigations }) }); setA(d.assessment); }
    catch (e) { setErr(String(e.message || e)); }
  };
  const transition = async (action) => {
    setBusy(true); setErr(null);
    try { const d = await api(`/api/privacy/assessments/${id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); setA(d.assessment); if (onChanged) onChanged(); }
    catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 720, maxHeight: "88vh", overflowY: "auto", fontFamily: F, color: C.t1 }}>
        {!a && !err && <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
        {err && <div style={{ padding: 14, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {err}</div>}
        {a && (
          <>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase" }}>{a.type} · assessment</div>
                <div style={{ fontSize: 17, fontFamily: SR, color: C.t1 }}>{a.title}</div>
                {a.subject && <div style={{ fontSize: 11, color: C.t3, fontFamily: M, marginTop: 2 }}>{a.subject}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...pill(STATUS[a.status] || C.t3), display: "inline-block", marginBottom: 6 }}>{a.status.replace("_", " ")}</div>
                {a.riskLevel && <div><span style={pill(RISK[a.riskLevel] || C.t3)}>{a.riskLevel} risk</span></div>}
                {a.dpiaRequired && <div style={{ fontSize: 9.5, color: C.rd, fontFamily: M, marginTop: 4 }}>⚠ DPIA required</div>}
              </div>
            </div>

            <div style={{ padding: "12px 18px" }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Questionnaire</div>
              {a.answers.map((q) => (
                <div key={q.questionId} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.br}22`, fontSize: 12 }}>
                  <span style={{ flex: 1, color: C.t2 }}>{q.question} {q.weight >= 4 && <span style={{ color: C.rd, fontSize: 9 }}>●</span>}</span>
                  <div style={{ display: "flex", gap: 4, flex: "none" }}>
                    {["yes", "no"].map((v) => (
                      <button key={v} disabled={!editable} onClick={() => setAnswer(q.questionId, v)} style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 10, fontFamily: M, textTransform: "uppercase", fontWeight: 700, cursor: editable ? "pointer" : "default",
                        background: q.answer === v ? (v === "yes" ? C.rd : C.gn) : "transparent", color: q.answer === v ? C.bg : C.t3, border: `1px solid ${q.answer === v ? (v === "yes" ? C.rd : C.gn) : C.br}`,
                      }}>{v}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "6px 18px 12px" }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Mitigations</div>
              {a.mitigations.map((m, i) => <div key={i} style={{ fontSize: 11.5, color: C.t2, padding: "2px 0" }}>• {m.text}</div>)}
              {editable && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input value={mit} onChange={(e) => setMit(e.target.value)} placeholder="add a mitigation / action" style={{ flex: 1, background: C.bg, border: `1px solid ${C.br}`, color: C.t1, fontFamily: F, fontSize: 11.5, padding: "6px 8px", borderRadius: 4 }} />
                  <button onClick={addMitigation} style={{ padding: "6px 12px", background: C.tl, color: C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Add</button>
                </div>
              )}
            </div>

            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.br}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {a.status === "DRAFT" && <button onClick={busy ? undefined : () => transition("submit")} style={btn(C.bl)}>Submit for review</button>}
              {a.status === "IN_REVIEW" && <>
                <button onClick={busy ? undefined : () => transition("approve")} style={btn(C.gn)}>✓ Approve</button>
                <button onClick={busy ? undefined : () => transition("reject")} style={btn(C.rd)}>✕ Reject</button>
              </>}
              {a.status === "REJECTED" && <button onClick={busy ? undefined : () => transition("reopen")} style={btn(C.am)}>Reopen</button>}
              {a.status === "APPROVED" && <span style={{ fontSize: 11, color: C.t3, fontFamily: M }}>Approved{a.approvedByName ? ` · ${a.approvedByName}` : ""} — immutable record.</span>}
              <button onClick={onClose} style={{ marginLeft: "auto", padding: "7px 12px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", borderRadius: 4, cursor: "pointer" }}>Close</button>
            </div>
            <div style={{ padding: "0 18px 12px", fontSize: 9.5, color: C.t4, fontFamily: M }}>● = high-weight trigger. Approval is gated (privacy:dpia:approve); every change is on the audit ledger.</div>
          </>
        )}
      </div>
    </div>
  );
}

const btn = (bg) => ({ padding: "7px 14px", background: bg, color: "#0b1020", border: "none", borderRadius: 4, fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });

export function AssessmentsView() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api("/api/privacy/assessments").then((d) => setRows(d.items)).catch((e) => setErr(String(e.message || e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (type) => {
    setCreating(false);
    try { const d = await api("/api/privacy/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) }); load(); setOpenId(d.assessment.id); }
    catch (e) { setErr(String(e.message || e)); }
  };

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: SR, color: C.t1 }}>Assessments</div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>PIA · DPIA · transfer · legitimate-interest · AI · vendor — templated, risk-scored, human-approved.</div>
        </div>
        <div style={{ position: "relative", flex: "none" }}>
          <button onClick={() => setCreating((v) => !v)} style={{ padding: "9px 15px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New assessment</button>
          {creating && (
            <div style={{ position: "absolute", right: 0, top: "110%", zIndex: 10, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 6, minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
              {TYPES.map((t) => <div key={t.id} onClick={() => create(t.id)} style={{ padding: "8px 10px", fontSize: 12.5, cursor: "pointer", borderRadius: 5, color: C.t1 }} onMouseEnter={(e) => e.currentTarget.style.background = C.s1} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.label}</div>)}
            </div>
          )}
        </div>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {!rows && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>No assessments yet. Start a PIA to screen a new processing activity.</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {(rows || []).map((a) => (
          <div key={a.id} onClick={() => setOpenId(a.id)} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto auto", gap: 12, alignItems: "center", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 14px", cursor: "pointer" }}>
            <span style={{ fontSize: 10, fontFamily: M, fontWeight: 700, color: C.tl }}>{a.type}</span>
            <div>
              <div style={{ fontSize: 13.5, color: C.t1 }}>{a.title}</div>
              {a.subject && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>{a.subject}</div>}
            </div>
            {a.riskLevel ? <span style={pill(RISK[a.riskLevel] || C.t3)}>{a.riskLevel}</span> : <span style={{ fontSize: 10, color: C.t4, fontFamily: M }}>unscored</span>}
            <span style={pill(STATUS[a.status] || C.t3)}>{a.status.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
