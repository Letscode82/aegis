import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract drill-in (CTR-1) ────────────────────────────────────────
//
// Reads GET /api/contracts/[id] — the contract, its extracted clauses
// (ContractClause), and its obligations (the SHARED Obligation entity,
// sourceType=CONTRACT). Obligation "Mark met" posts to
// /api/contracts/[id]/obligations/[obligationId] and is chain-sealed
// server-side. Conservative-AI: the UI only requests; the server audits.

const money = (n, ccy) => {
  if (n == null) return "—";
  const v = Number(n) || 0;
  const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${sym}${(v / 1_000).toFixed(1)}k`;
  return `${sym}${v.toFixed(0)}`;
};
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const RISK_COLOR = { HIGH: C.rd, MEDIUM: C.am, LOW: C.gn };
const OBL_COLOR = { OPEN: C.bl, IN_PROGRESS: C.am, MET: C.gn, BREACHED: C.rd, WAIVED: C.t3 };

function Pill({ t, c }) {
  return <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .6, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", color: c, border: `1px solid ${c}55` }}>{t}</span>;
}

export function ContractDetailModal({ contractId, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [playbook, setPlaybook] = useState({}); // clauseType -> entry
  const [openClause, setOpenClause] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/contracts/${contractId}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d.contract))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  // CTR-5 — the playbook, for clause-vs-standard comparison.
  useEffect(() => {
    fetch("/api/contracts/clause-library")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setPlaybook(Object.fromEntries((d.entries || []).map((e) => [e.clauseType, e]))); })
      .catch(() => {});
  }, []);

  const setObligationStatus = async (obligationId, status) => {
    setBusy(obligationId);
    try {
      const r = await fetch(`/api/contracts/${contractId}/obligations/${obligationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
      onChanged?.();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(null);
    }
  };

  const c = data;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, width: "min(860px, 100%)", boxShadow: "0 24px 80px rgba(0,0,0,.5)" }}>
        {error && <div style={{ padding: "10px 18px", color: C.rd, fontFamily: M, fontSize: 11, borderBottom: `1px solid ${C.br}` }}>⚠ {error}</div>}
        {!c ? (
          <div style={{ padding: 48, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Loading contract…</div>
        ) : (
          <>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.br}`, borderLeft: `3px solid ${RISK_COLOR[c.risk]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                    <Pill t={c.status.replace(/_/g, " ")} c={C.tl} />
                    <Pill t={`${c.risk} RISK`} c={RISK_COLOR[c.risk]} />
                    {c.type && <span style={{ fontSize: 10, fontFamily: M, color: C.t3 }}>{c.type}</span>}
                  </div>
                  <div style={{ fontSize: 19, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>
                    {c.counterpartyName || "No counterparty"}{c.matterTitle ? ` · Matter: ${c.matterTitle}` : ""}{c.governingLaw ? ` · ${c.governingLaw}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontFamily: SR, color: C.t1, lineHeight: 1 }}>{money(c.value, c.currency)}</div>
                  <div style={{ fontSize: 9, color: C.t4, fontFamily: M }}>contract value</div>
                  <div onClick={onClose} style={{ marginTop: 8, cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1 }}>✕ CLOSE</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: M, color: C.t3 }}>
                <span>Effective <span style={{ color: C.t1 }}>{fmtDate(c.effectiveDate)}</span></span>
                <span>Expires <span style={{ color: c.daysToExpiry != null && c.daysToExpiry <= 90 ? C.am : C.t1 }}>{fmtDate(c.expiryDate)}</span>{c.daysToExpiry != null && <span style={{ color: c.daysToExpiry < 0 ? C.rd : c.daysToExpiry <= 90 ? C.am : C.t4 }}> ({c.daysToExpiry < 0 ? `${-c.daysToExpiry}d ago` : `${c.daysToExpiry}d`})</span>}</span>
                {c.autoRenew && <span style={{ color: C.am }}>⟳ Auto-renew{c.noticeWindowDays ? ` · ${c.noticeWindowDays}d notice` : ""}</span>}
              </div>
            </div>

            {/* Clauses */}
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
                Clause analysis <span style={{ color: C.t4 }}>· {c.clauses.length} extracted · {c.deviationCount} deviating</span>
              </div>
              {c.clauses.length === 0 ? (
                <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No clauses extracted yet. The contract agent populates these on review (CTR-2).</div>
              ) : c.clauses.map((cl) => {
                const pb = playbook[cl.type];
                const open = openClause === cl.id;
                return (
                <div key={cl.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{cl.type.replace(/_/g, " ")}</span>
                    <Pill t={cl.risk} c={RISK_COLOR[cl.risk]} />
                    {cl.deviation && <Pill t="DEVIATES" c={C.rd} />}
                    {pb && (
                      <span onClick={() => setOpenClause(open ? null : cl.id)} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.bl, textTransform: "uppercase" }}>
                        {open ? "▾ playbook" : "⚖ vs playbook"}
                      </span>
                    )}
                  </div>
                  {cl.summary && <div style={{ fontSize: 10.5, color: C.tl, marginBottom: 2 }}>{cl.summary}</div>}
                  <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.5 }}>{cl.text}</div>
                  {pb && open && (
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ padding: "8px 10px", background: C.s1, borderRadius: 5, borderLeft: `2px solid ${cl.deviation ? C.rd : C.gn}` }}>
                        <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3 }}>Playbook standard</div>
                        <div style={{ fontSize: 10, color: C.t1, lineHeight: 1.5 }}>{pb.standardText}</div>
                      </div>
                      <div style={{ padding: "8px 10px", background: C.s1, borderRadius: 5 }}>
                        {pb.fallbackText && <><div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 3 }}>Acceptable fallback</div>
                        <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.5, marginBottom: 6 }}>{pb.fallbackText}</div></>}
                        {pb.guidance && <><div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.am, marginBottom: 3 }}>Reviewer guidance</div>
                        <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.5 }}>{pb.guidance}</div></>}
                      </div>
                    </div>
                  )}
                </div>
              );})}
            </div>

            {/* Obligations */}
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
                Obligations &amp; key dates <span style={{ color: C.t4 }}>· {c.obligations.length} · {c.overdueObligationCount} overdue</span>
              </div>
              {c.obligations.length === 0 ? (
                <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No obligations tracked yet.</div>
              ) : c.obligations.map((o) => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: C.t1, marginBottom: 2 }}>{o.description}</div>
                    <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.t3, fontFamily: M, flexWrap: "wrap", alignItems: "center" }}>
                      <span>Due <span style={{ color: o.overdue ? C.rd : C.t1 }}>{fmtDate(o.dueDate)}</span></span>
                      {o.recurrence && <span style={{ color: C.tl }}>⟳ {o.recurrence}</span>}
                      {o.ownerName && <span>Owner {o.ownerName}</span>}
                      <Pill t={o.status.replace(/_/g, " ")} c={OBL_COLOR[o.status]} />
                      {o.overdue && <span style={{ color: C.rd }}>⚠ overdue</span>}
                    </div>
                  </div>
                  {canManage && o.status !== "MET" && o.status !== "WAIVED" && (
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {o.status === "OPEN" && (
                        <button disabled={busy === o.id} onClick={() => setObligationStatus(o.id, "IN_PROGRESS")} style={btn(C.am)}>Start</button>
                      )}
                      <button disabled={busy === o.id} onClick={() => setObligationStatus(o.id, "MET")} style={btn(C.gn)}>Mark met</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Counterparty review round-trip */}
            <ReviewPanel contractId={contractId} canManage={canManage} />

            {/* Version history + redline diff (CTR-5b) */}
            <VersionsPanel contractId={contractId} canManage={canManage} />
          </>
        )}
      </div>
    </div>
  );
}

const REVIEW_ACTION_LABEL = {
  "contract.review.invited": "Invited to review",
  "contract.review.consented": "Accepted review terms",
  "contract.review.viewed": "Viewed the draft",
  "contract.review.commented": "Commented",
  "contract.review.accepted": "Accepted the draft",
  "contract.review.countered": "Proposed changes (counter)",
  "contract.review.revoked": "Link revoked",
};
const TOKEN_COLOR = { ACTIVE: C.bl, USED: C.gn, REVOKED: C.t3, EXPIRED: C.am };
const relTime = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
};

function ReviewPanel({ contractId, canManage }) {
  const [act, setAct] = useState(null);
  const [err, setErr] = useState(null);
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshLink, setFreshLink] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/review`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setAct(d.activity))
      .catch((e) => setErr(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!personId) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setFreshLink(d.url); setPersonId(""); load();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const revoke = async (tokenId) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/review`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      load();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.br}` }}>
      <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Counterparty review {act && <span style={{ color: C.t4 }}>· {act.tokens.length} link{act.tokens.length === 1 ? "" : "s"}</span>}
      </div>
      {err && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 8 }}>⚠ {err}</div>}
      {!act ? <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>Loading…</div> : (
        <>
          {act.tokens.length === 0 && <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic", marginBottom: 8 }}>No review links issued yet.</div>}
          {act.tokens.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.br}22` }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 11, color: C.t1 }}>{t.personName || "Counterparty contact"}</span>
                {t.lastDecision && <span style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginLeft: 8 }}>last: {t.lastDecision}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <Pill t={t.status} c={TOKEN_COLOR[t.status] || C.t3} />
                {canManage && t.status === "ACTIVE" && <button disabled={busy} onClick={() => revoke(t.id)} style={btn(C.rd)}>Revoke</button>}
              </div>
            </div>
          ))}

          {act.events.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Activity</div>
              {act.events.slice(0, 8).map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", fontSize: 10.5 }}>
                  <span style={{ color: C.t4, fontFamily: M, fontSize: 9, flexShrink: 0, minWidth: 52 }}>{relTime(e.at)}</span>
                  <span style={{ color: C.t2 }}>
                    <b style={{ color: C.t1 }}>{e.personName || "System"}</b> · {REVIEW_ACTION_LABEL[e.action] || e.action}
                    {e.comment && <span style={{ color: C.t3 }}> — “{e.comment.length > 90 ? e.comment.slice(0, 88) + "…" : e.comment}”</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <div style={{ marginTop: 12 }}>
              {freshLink && (
                <div style={{ padding: "8px 10px", background: C.s1, borderRadius: 5, marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontFamily: M, color: C.gn, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Link created — send to the counterparty</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input readOnly value={freshLink} style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t2, fontFamily: M, fontSize: 10, padding: "5px 8px" }} />
                    <button onClick={() => { try { navigator.clipboard.writeText(freshLink); } catch { /* noop */ } }} style={btn(C.cy)}>Copy</button>
                  </div>
                  <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 4 }}>Shown once. The raw token isn't stored — only its hash.</div>
                </div>
              )}
              {act.availableContacts.length === 0 ? (
                <div style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic" }}>No counterparty contacts on file — add a contact (Person · COUNTERPARTY_CONTACT) for this counterparty to invite them.</div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }}>
                    <option value="">Select a contact…</option>
                    {act.availableContacts.map((p) => <option key={p.personId} value={p.personId}>{p.name}{p.email ? ` (${p.email})` : ""}</option>)}
                  </select>
                  <button disabled={busy || !personId} onClick={invite} style={{ ...btn(C.cy), opacity: !personId ? 0.5 : 1 }}>Invite to review</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btn = (c) => ({
  padding: "4px 10px", borderRadius: 4, border: `1px solid ${c}`, background: "transparent",
  color: c, fontSize: 9.5, fontFamily: M, fontWeight: 600, letterSpacing: .5, cursor: "pointer", textTransform: "uppercase",
});

// ── Version history + redline diff (CTR-5b) ──────────────────────────
const VSRC_LABEL = { SPAWN: "spawn", EXTRACTION: "re-review", COUNTERPARTY: "counterparty", MANUAL: "manual" };
const CHANGE_COLOR = { added: C.gn, removed: C.rd, changed: C.am };

function VersionsPanel({ contractId, canManage }) {
  const [versions, setVersions] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [diff, setDiff] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/versions`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => {
        setVersions(d.versions || []);
        if ((d.versions || []).length >= 2) { setTo(String(d.versions[0].version)); setFrom(String(d.versions[1].version)); }
      })
      .catch((e) => setErr(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const snapshot = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (d.unchanged) setErr("No clause changes since the last version — nothing to snapshot.");
      load();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const runDiff = async () => {
    if (!from || !to || from === to) return;
    setBusy(true); setErr(null); setDiff(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/versions/diff?from=${from}&to=${to}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDiff(d.diff);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const sel = { background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: M, fontSize: 10.5, padding: "5px 7px" };

  return (
    <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.br}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
          Version history {versions && <span style={{ color: C.t4 }}>· {versions.length}</span>}
        </div>
        {canManage && <button disabled={busy} onClick={snapshot} style={btn(C.tl)}>Snapshot now</button>}
      </div>
      {err && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 8 }}>⚠ {err}</div>}
      {!versions ? <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>Loading…</div>
        : versions.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No versions yet — a snapshot is taken automatically when the agent extracts clauses.</div>
        : (
        <>
          {versions.map((v) => (
            <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${C.br}22`, fontSize: 10.5 }}>
              <span style={{ fontFamily: M, color: C.tl, minWidth: 28 }}>v{v.version}</span>
              <span style={{ color: C.t1, flex: 1 }}>{v.label}</span>
              <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>{VSRC_LABEL[v.source] || v.source} · {v.clauseCount} clause{v.clauseCount === 1 ? "" : "s"}</span>
            </div>
          ))}
          {versions.length >= 2 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9.5, fontFamily: M, color: C.t4, textTransform: "uppercase", letterSpacing: 1 }}>Redline</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} style={sel}>{versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}</select>
              <span style={{ color: C.t4, fontFamily: M }}>→</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} style={sel}>{versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}</select>
              <button disabled={busy || from === to} onClick={runDiff} style={{ ...btn(C.bl), opacity: from === to ? .5 : 1 }}>Compare</button>
            </div>
          )}
          {diff && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: C.s1, borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontFamily: M, color: C.t3, marginBottom: 8 }}>
                v{diff.fromVersion} → v{diff.toVersion} · <span style={{ color: C.gn }}>+{diff.counts.added}</span> <span style={{ color: C.rd }}>−{diff.counts.removed}</span> <span style={{ color: C.am }}>~{diff.counts.changed}</span> · {diff.counts.unchanged} unchanged
              </div>
              {diff.changes.length === 0 ? <div style={{ fontSize: 10.5, color: C.gn, fontFamily: M }}>✓ No clause differences.</div>
                : diff.changes.map((c, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${C.br}22` }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: CHANGE_COLOR[c.kind] }}>{c.kind}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: C.t1 }}>{c.type.replace(/_/g, " ")}</span>
                      {c.kind === "changed" && <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{c.fields.join(", ")}</span>}
                    </div>
                    {c.kind === "added" && <div style={{ fontSize: 10, color: C.gn, lineHeight: 1.5 }}>+ {c.to.text}</div>}
                    {c.kind === "removed" && <div style={{ fontSize: 10, color: C.rd, lineHeight: 1.5, textDecoration: "line-through", opacity: .8 }}>− {c.from.text}</div>}
                    {c.kind === "changed" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 3 }}>
                        <div style={{ fontSize: 10, color: C.rd, lineHeight: 1.5 }}><span style={{ color: C.t4, fontFamily: M, fontSize: 8.5 }}>v{diff.fromVersion} </span>{c.from.text}{c.fields.includes("risk") ? ` · ${c.from.risk}` : ""}</div>
                        <div style={{ fontSize: 10, color: C.gn, lineHeight: 1.5 }}><span style={{ color: C.t4, fontFamily: M, fontSize: 8.5 }}>v{diff.toVersion} </span>{c.to.text}{c.fields.includes("risk") ? ` · ${c.to.risk}` : ""}</div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
