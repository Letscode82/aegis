import { useState, useEffect, useCallback, useMemo } from "react";
import { C, F, M } from "@aegis/ui";

// ── Contract collaboration / comments (CTR-10) ───────────────────────
//
// Threaded discussion on a contract. Internal users switch each comment between
// INTERNAL (business ↔ legal, private) and SHARED (visible to the external
// counterparty on the review portal) — so the same panel carries both the
// internal back-and-forth and the open negotiation with the third party. Reads
// GET /api/contracts/[id]/comments; posts to the same; resolve via
// .../comments/[commentId]/resolve.

const fmt = (iso) => { const d = new Date(iso); return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`; };
const ROLE_COLOR = (role) => {
  const r = (role || "").toLowerCase();
  if (r === "counterparty") return C.am;
  if (r === "gc" || r === "attorney" || r === "legal_ops") return C.bl;
  return C.tl; // business / requester / other
};

function Composer({ onPost, busy, allowShared = true, compact }) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("INTERNAL");
  const post = () => { if (body.trim()) { onPost(body.trim(), visibility); setBody(""); } };
  return (
    <div style={{ marginTop: compact ? 6 : 0 }}>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={compact ? "Reply…" : "Add a comment…"} rows={compact ? 2 : 3}
        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "8px 9px", resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {allowShared && (
          <div style={{ display: "flex", gap: 3 }}>
            {[["INTERNAL", "◧ Internal", "Business ↔ legal only"], ["SHARED", "⤢ Share w/ counterparty", "Visible to the third party"]].map(([v, label, hint]) => {
              const on = visibility === v;
              return <span key={v} onClick={() => setVisibility(v)} title={hint} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .4, padding: "4px 8px", borderRadius: 4, textTransform: "uppercase", color: on ? C.bg : (v === "SHARED" ? C.am : C.t2), background: on ? (v === "SHARED" ? C.am : C.bl) : "transparent", border: `1px solid ${on ? (v === "SHARED" ? C.am : C.bl) : C.br}` }}>{label}</span>;
            })}
          </div>
        )}
        <button onClick={post} disabled={busy || !body.trim()} style={{ marginLeft: "auto", padding: "6px 13px", background: C.bl, color: "#fff", border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: busy || !body.trim() ? .5 : 1 }}>{busy ? "…" : "Post"}</button>
      </div>
    </div>
  );
}

export function ContractCommentsPanel({ contractId, canManage }) {
  const [comments, setComments] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/contracts/${contractId}/comments`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setComments(d.comments || []))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const post = async (body, visibility, parentId = null) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, visibility, parentId }) });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setReplyTo(null); load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const toggleResolve = async (c) => {
    setBusy(true);
    try {
      await fetch(`/api/contracts/${contractId}/comments/${c.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !c.resolved }) });
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  // Group into threads: top-level (parentId null) + their replies.
  const threads = useMemo(() => {
    const list = comments || [];
    const byParent = {};
    for (const c of list) if (c.parentId) (byParent[c.parentId] ||= []).push(c);
    return list.filter((c) => !c.parentId).map((c) => ({ ...c, replies: byParent[c.id] || [] }));
  }, [comments]);

  const Bubble = ({ c, isReply }) => (
    <div style={{ marginLeft: isReply ? 22 : 0, padding: "8px 10px", background: c.resolved ? C.cd : C.s1, border: `1px solid ${c.visibility === "SHARED" ? C.am + "55" : C.br}`, borderRadius: 6, marginBottom: 6, opacity: c.resolved ? .6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: F, color: C.t1, fontWeight: 600 }}>{c.authorName}</span>
        {c.authorRole && <span style={{ fontSize: 8, fontFamily: M, letterSpacing: .3, color: ROLE_COLOR(c.authorRole), border: `1px solid ${ROLE_COLOR(c.authorRole)}66`, borderRadius: 3, padding: "0 4px", textTransform: "uppercase" }}>{c.authorRole}</span>}
        <span style={{ fontSize: 8, fontFamily: M, letterSpacing: .3, color: c.visibility === "SHARED" ? C.am : C.t4, textTransform: "uppercase" }}>{c.visibility === "SHARED" ? "⤢ shared" : "◧ internal"}</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, marginLeft: "auto" }}>{fmt(c.createdAt)}</span>
      </div>
      <div style={{ fontSize: 12, fontFamily: F, color: C.t1, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</div>
      {canManage && (
        <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
          {!isReply && <span onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} style={{ fontSize: 9, fontFamily: M, color: C.cy, cursor: "pointer", textTransform: "uppercase", letterSpacing: .5 }}>↳ Reply</span>}
          <span onClick={() => toggleResolve(c)} style={{ fontSize: 9, fontFamily: M, color: c.resolved ? C.t4 : C.gn, cursor: "pointer", textTransform: "uppercase", letterSpacing: .5 }}>{c.resolved ? "↺ Reopen" : "✓ Resolve"}</span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 18, padding: "14px 16px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontFamily: M, color: C.t2, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Collaboration {comments && <span style={{ color: C.t4 }}>· {comments.length}</span>}</div>
      <div style={{ fontSize: 10, fontFamily: F, color: C.t4, marginBottom: 12, lineHeight: 1.4 }}>
        The business and internal legal discuss privately (<b style={{ color: C.bl }}>Internal</b>); switch a comment to <b style={{ color: C.am }}>Share</b> to negotiate in the open with the counterparty, who replies from their review link.
      </div>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 10.5, marginBottom: 10 }}>⚠ {error}</div>}

      {canManage && <div style={{ marginBottom: 14 }}><Composer onPost={(b, v) => post(b, v)} busy={busy} /></div>}

      {!comments ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>◎ Loading…</div>
        : threads.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>No comments yet — start the discussion.</div>
        : threads.map((t) => (
          <div key={t.id} style={{ marginBottom: 10 }}>
            <Bubble c={t} />
            {t.replies.map((r) => <Bubble key={r.id} c={r} isReply />)}
            {replyTo === t.id && canManage && <div style={{ marginLeft: 22 }}><Composer onPost={(b, v) => post(b, v, t.id)} busy={busy} allowShared={t.visibility === "SHARED"} compact /></div>}
          </div>
        ))}
    </div>
  );
}
