import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Graded redline on their paper (PR C) ──────────────────────────────
//
// The flagship review surface. Start a review against the playbook → each
// clause is graded Standard / Fallback / Escalate / MISSING, with our-position
// replacement language drafted as the tracked-change target and a three-field
// gap card (our position / their position / why). Accept / reject / edit each
// finding (the human gate), then apply the accepted ones into a new version.

const card = { background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 14 };
const btn = (fill, fg) => ({ padding: "6px 11px", background: fill, color: fg, border: `1px solid ${fill === "transparent" ? C.br : fill}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" });
const GRADE = {
  STANDARD: { c: C.gn, label: "Standard" },
  FALLBACK: { c: C.am, label: "Fallback" },
  ESCALATE: { c: C.rd, label: "Escalate" },
  MISSING: { c: C.rd, label: "Missing" },
};

async function api(url, opts) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export function GradedReviewPanel({ contractId }) {
  const [reviews, setReviews] = useState([]);
  const [review, setReview] = useState(null);
  const [paperType, setPaperType] = useState("THEIR_PAPER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // {id, text}

  const loadList = useCallback(async () => {
    try { const d = await api(`/api/contracts/${contractId}/reviews`); setReviews(d.reviews || []); if (d.reviews?.[0]) loadOne(d.reviews[0].id); }
    catch (e) { setErr(String(e.message || e)); }
  }, [contractId]);
  const loadOne = useCallback(async (rid) => {
    try { const d = await api(`/api/contracts/${contractId}/reviews/${rid}`); setReview(d.review); }
    catch (e) { setErr(String(e.message || e)); }
  }, [contractId]);
  useEffect(() => { loadList(); }, [loadList]);

  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); } };

  const start = () => run(async () => {
    const d = await api(`/api/contracts/${contractId}/reviews`, { method: "POST", body: JSON.stringify({ paperType }) });
    setReview(d.review); await loadList();
  });
  const decide = (fid, verdict, editedText) => run(async () => {
    await api(`/api/contracts/${contractId}/reviews/${review.id}/findings/${fid}`, { method: "POST", body: JSON.stringify({ verdict, editedText }) });
    setEditing(null); await loadOne(review.id);
  });
  const acceptAllSafe = () => run(async () => {
    const safe = (review.findings || []).filter((f) => f.grade === "FALLBACK" && f.decision === "PENDING");
    for (const f of safe) await api(`/api/contracts/${contractId}/reviews/${review.id}/findings/${f.id}`, { method: "POST", body: JSON.stringify({ verdict: "accept" }) });
    await loadOne(review.id);
  });
  const apply = () => run(async () => {
    const d = await api(`/api/contracts/${contractId}/reviews/${review.id}`, { method: "POST", body: JSON.stringify({ action: "apply" }) });
    setReview(d.review); await loadList();
  });

  const s = review?.summary;
  const actionable = (review?.findings || []).filter((f) => f.grade !== "STANDARD");
  const accepted = actionable.filter((f) => f.decision === "ACCEPTED" || f.decision === "EDITED").length;

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: SR }}>Review their paper</div>
          <div style={{ fontSize: 11, color: C.t3 }}>Grade each clause against the playbook and redline it back on their document.</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={paperType} onChange={(e) => setPaperType(e.target.value)} style={{ ...btn("transparent", C.t2), cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
            <option value="THEIR_PAPER">Their paper</option>
            <option value="OUR_PAPER_THEIR_MARKS">Our paper, their marks</option>
          </select>
          <button style={btn(C.bl, "#fff")} disabled={busy} onClick={start}>⟐ Review against playbook</button>
        </div>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {err}</div>}

      {reviews.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {reviews.map((r) => (
            <button key={r.id} onClick={() => loadOne(r.id)} style={{ ...btn(review?.id === r.id ? C.bl : "transparent", review?.id === r.id ? "#fff" : C.t3), textTransform: "none", letterSpacing: 0 }}>
              {new Date(r.createdAt).toLocaleDateString()} · {r.status}
            </button>
          ))}
        </div>
      )}

      {s && (
        <div style={{ ...card, marginBottom: 12, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", borderColor: s.riskBand === "HIGH" ? C.rd : s.riskBand === "MEDIUM" ? C.am : C.gn }}>
          <div>
            <div style={{ fontSize: 22, fontFamily: SR, color: s.riskBand === "HIGH" ? C.rd : s.riskBand === "MEDIUM" ? C.am : C.gn }}>{s.weightedScore}<span style={{ fontSize: 12, color: C.t3 }}>/100</span></div>
            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.5 }}>ON-PLAYBOOK</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: C.t1, marginBottom: 4 }}>{s.verdict}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: M }}>
              <span style={{ color: C.gn }}>{s.standard} standard</span>
              <span style={{ color: C.am }}>{s.fallback} fallback</span>
              <span style={{ color: C.rd }}>{s.escalate} escalate</span>
              <span style={{ color: C.rd }}>{s.missing} missing</span>
            </div>
          </div>
          {review.status !== "APPLIED" && review.status !== "EXPORTED" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn("transparent", C.am)} disabled={busy} onClick={acceptAllSafe} title="Accept all fallback-level clauses">Accept all safe</button>
              <button style={btn(C.gn, "#fff")} disabled={busy || accepted === 0} onClick={apply} title="Apply accepted redlines into a new version">Apply {accepted || ""} redline{accepted === 1 ? "" : "s"}</button>
            </div>
          )}
          {(review.status === "APPLIED" || review.status === "EXPORTED") && (
            <span style={{ fontSize: 10, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "3px 8px" }}>APPLIED ✓</span>
          )}
        </div>
      )}

      {review && actionable.length === 0 && s && (
        <div style={{ ...card, fontSize: 12, color: C.gn }}>✓ Every clause is on our positions — nothing to redline.</div>
      )}

      {actionable.map((f) => {
        const g = GRADE[f.grade] || GRADE.ESCALATE;
        const decided = f.decision !== "PENDING";
        return (
          <div key={f.id} style={{ ...card, marginBottom: 10, borderLeft: `3px solid ${g.c}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 9, fontFamily: M, color: "#fff", background: g.c, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5 }}>{g.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{f.clauseType.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{f.editKind.toLowerCase()}</span>
              </div>
              {decided ? (
                <span style={{ fontSize: 9.5, fontFamily: M, color: f.decision === "REJECTED" ? C.t4 : C.gn, border: `1px solid ${f.decision === "REJECTED" ? C.t4 : C.gn}`, borderRadius: 4, padding: "2px 7px" }}>{f.decision}</span>
              ) : (review?.status === "IN_PROGRESS" || review?.status === "READY") && (
                <div style={{ display: "flex", gap: 5 }}>
                  <button style={btn(C.gn, "#fff")} disabled={busy} onClick={() => decide(f.id, "accept")}>Accept</button>
                  <button style={btn("transparent", C.bl)} disabled={busy} onClick={() => setEditing({ id: f.id, text: f.suggestedText || "" })}>Edit</button>
                  <button style={btn("transparent", C.rd)} disabled={busy} onClick={() => decide(f.id, "reject")}>Reject</button>
                </div>
              )}
            </div>

            {/* three-field gap card */}
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {f.theirPosition && <div style={{ fontSize: 11, lineHeight: 1.45 }}><span style={{ fontFamily: M, fontSize: 9, color: C.rd }}>THEIR POSITION</span><div style={{ color: C.t2 }}>{f.theirPosition}</div></div>}
              {f.ourPosition && <div style={{ fontSize: 11, lineHeight: 1.45 }}><span style={{ fontFamily: M, fontSize: 9, color: C.gn }}>OUR POSITION</span><div style={{ color: C.t2 }}>{f.ourPosition}</div></div>}
              {f.rationale && <div style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic" }}>{f.rationale}</div>}
            </div>

            {/* the tracked-change target */}
            {editing?.id === f.id ? (
              <div style={{ marginTop: 8 }}>
                <textarea value={editing.text} onChange={(e) => setEditing({ id: f.id, text: e.target.value })} rows={4} style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: 8, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                  <button style={btn("transparent", C.t3)} onClick={() => setEditing(null)}>Cancel</button>
                  <button style={btn(C.bl, "#fff")} disabled={busy} onClick={() => decide(f.id, "edit", editing.text)}>Accept edited</button>
                </div>
              </div>
            ) : f.suggestedText && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.gn}0e`, border: `1px dashed ${C.gn}66`, borderRadius: 6 }}>
                <span style={{ fontFamily: M, fontSize: 9, color: C.gn }}>SUGGESTED REDLINE</span>
                <div style={{ fontSize: 11.5, color: C.t1, lineHeight: 1.5, marginTop: 2 }}>{f.suggestedText}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
