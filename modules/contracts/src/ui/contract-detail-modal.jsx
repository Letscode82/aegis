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
// CLM lifecycle labels (Phase 1b).
const STATUS_LABEL = {
  DRAFT: "Draft", IN_NEGOTIATION: "In negotiation", IN_REVIEW: "In approval",
  APPROVED: "Approved", EXECUTED: "Executed", ACTIVE: "Active",
  EXPIRED: "Expired", TERMINATED: "Terminated",
};
const advanceColor = (s) => (s === "TERMINATED" ? C.rd : s === "ACTIVE" || s === "EXECUTED" || s === "APPROVED" ? C.gn : C.cy);

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

  // CLM lifecycle transition — the server guards the state machine + stamps
  // the timestamps + chain-seals; the UI just requests the target state.
  const transitionStatus = async (status) => {
    setBusy("status:" + status);
    try {
      const r = await fetch(`/api/contracts/${contractId}/status`, {
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

            {/* CLM lifecycle — advance controls + timeline (Phase 1b) */}
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.br}`, background: C.s1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
                  Lifecycle <span style={{ color: C.tl }}>· {STATUS_LABEL[c.status] || c.status}</span>
                </div>
                {canManage && (c.allowedTransitions?.length ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {c.allowedTransitions.map((s) => (
                      <button key={s} disabled={busy === "status:" + s} onClick={() => transitionStatus(s)} style={btn(advanceColor(s))}>
                        → {STATUS_LABEL[s] || s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>Terminal state — no further transitions</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 10, fontFamily: M }}>
                {[["Created", c.createdAt], ["Status changed", c.statusChangedAt], ["Executed", c.executedAt], ["Activated", c.activatedAt], ["Renewed", c.renewedAt], ["Terminated", c.terminatedAt]]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <span key={k}><span style={{ color: C.t4 }}>{k}</span> <span style={{ color: C.t2 }}>{fmtDate(v)}</span></span>
                  ))}
              </div>
              {c.status === "IN_REVIEW" && (
                <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
                  In approval — the Contract Approval ladder (AI risk review → legal → GC sign-off) governs this stage. Approve it there, then advance to <b style={{ color: C.t3 }}>Approved</b>.
                </div>
              )}
            </div>

            {/* Clauses */}
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
                  Clause analysis <span style={{ color: C.t4 }}>· {c.clauses.length} extracted · {c.deviationCount} deviating</span>
                </div>
                {c.riskScore && (
                  <span
                    title={c.riskScore.score != null
                      ? `Deterministic clause-derived risk score. Drivers: ${(c.riskScore.drivers || []).map((d) => `${d.type.replace(/_/g, " ")}${d.deviation ? " (deviates)" : ""}`).join(", ") || "none"}`
                      : "No clauses to score"}
                    style={{ marginLeft: "auto", fontSize: 9.5, fontFamily: M, fontWeight: 700, letterSpacing: .5, padding: "3px 9px", borderRadius: 4, color: RISK_COLOR[c.riskScore.band] || C.t3, border: `1px solid ${(RISK_COLOR[c.riskScore.band] || C.t3)}55` }}
                  >
                    RISK {c.riskScore.score != null ? `${c.riskScore.score}/100` : "—"} · {c.riskScore.band}
                  </span>
                )}
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
              {canManage && <ReExtractPanel contractId={contractId} onDone={load} />}
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

// ── Live re-extraction on amendment (CLM Phase 3a) ───────────────────
//
// Contract intelligence is first populated at intake-spawn. When a contract
// is amended — a new redline, a counter-signed version — paste the amended
// text here to re-run the deterministic playbook extractor. The server
// replaces the clause set and snapshots a new EXTRACTION version, so the
// version panel's redline shows exactly what changed, clause by clause.
// Obligations are deliberately left intact (they carry human-set owners /
// due dates / lifecycle status).
function ReExtractPanel({ contractId, onDone }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      setText("");
      onDone?.();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <span onClick={() => setOpen(true)} style={{ cursor: "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: .5, color: C.cy, textTransform: "uppercase" }}>
          ⟳ Re-extract from amended text
        </span>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.br}` }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>Re-extract from amended text</span>
        <span onClick={() => { setOpen(false); setErr(null); setResult(null); }} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 9.5, fontFamily: M, color: C.t3 }}>✕</span>
      </div>
      <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginBottom: 8 }}>
        Paste the amended contract text. The playbook extractor re-runs, the clause set is replaced, and a new version is snapshotted — the redline below shows what changed. Obligations are left untouched.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the amended / counter-signed contract text…"
        style={{ width: "100%", minHeight: 110, resize: "vertical", padding: "8px 10px", fontSize: 11, fontFamily: F, lineHeight: 1.5, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, boxSizing: "border-box" }}
      />
      {err && <div style={{ fontSize: 10, color: C.rd, marginTop: 6 }}>{err}</div>}
      {result && (
        <div style={{ fontSize: 10.5, color: C.gn, marginTop: 6 }}>
          Re-extracted {result.clauseCount} clause{result.clauseCount === 1 ? "" : "s"} · {result.deviationCount} deviating
          {result.newVersion != null ? ` · new version v${result.newVersion} (see Version history below)` : " · no clause changes — no new version"}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button disabled={busy || !text.trim()} onClick={run} style={{ ...btn(C.cy), opacity: busy || !text.trim() ? 0.5 : 1 }}>
          {busy ? "Re-extracting…" : "Re-extract"}
        </button>
      </div>
    </div>
  );
}

// ── Version history + redline diff (CTR-5b) ──────────────────────────
const VSRC_LABEL = { SPAWN: "spawn", EXTRACTION: "re-review", COUNTERPARTY: "counterparty", MANUAL: "manual" };
const CHANGE_COLOR = { added: C.gn, removed: C.rd, changed: C.am };
// AI change-narrative (Phase 3b) — directional-risk + decision-status colours.
const NAR_RISK_COLOR = { HIGHER: C.rd, LOWER: C.gn, MIXED: C.am, UNCHANGED: C.t3 };
const NAR_RISK_LABEL = { HIGHER: "↑ higher risk", LOWER: "↓ lower risk", MIXED: "↕ mixed", UNCHANGED: "= unchanged" };

function VersionsPanel({ contractId, canManage }) {
  const [versions, setVersions] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [diff, setDiff] = useState(null);
  const [nar, setNar] = useState(null);      // AI change-narrative (Phase 3b)
  const [narBusy, setNarBusy] = useState(false);

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
    setBusy(true); setErr(null); setDiff(null); setNar(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/versions/diff?from=${from}&to=${to}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDiff(d.diff);
      // Load any existing AI change-narrative for this version pair (Phase 3b).
      fetch(`/api/contracts/${contractId}/narrative?from=${d.diff.fromVersion}&to=${d.diff.toVersion}`)
        .then((rr) => (rr.ok ? rr.json() : null))
        .then((dd) => { if (dd?.ok) setNar(dd.narrative); })
        .catch(() => {});
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  // Phase 3b — generate the AI change-narrative. Writes a PENDING
  // AgentDecision server-side; it surfaces as "pending review", never as fact.
  const genNarrative = async () => {
    if (!diff) return;
    setNarBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/narrative`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersion: diff.fromVersion, toVersion: diff.toVersion }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNar(d.narrative);
    } catch (e) { setErr(String(e.message || e)); } finally { setNarBusy(false); }
  };

  // Phase 3b — the human gate. Approve/reject is the only path off PENDING.
  const resolveNar = async (action) => {
    if (!nar) return;
    setNarBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/narrative/${nar.id}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNar(d.narrative);
    } catch (e) { setErr(String(e.message || e)); } finally { setNarBusy(false); }
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

              {/* AI change-narrative (Phase 3b) — human-gated via AgentDecision */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.br}44` }}>
                {!nar ? (
                  <button disabled={narBusy} onClick={genNarrative} style={{ ...btn(C.pu || C.bl), opacity: narBusy ? .5 : 1 }}>
                    {narBusy ? "Analyzing…" : "✨ Generate AI change summary"}
                  </button>
                ) : (
                  <div style={{ padding: "10px 12px", background: C.bg, borderRadius: 6, border: `1px solid ${nar.status === "PENDING" ? C.am + "66" : nar.status === "REJECTED" ? C.rd + "44" : C.gn + "55"}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.pu || C.bl }}>AI change summary</span>
                      <Pill t={NAR_RISK_LABEL[nar.riskAssessment] || nar.riskAssessment} c={NAR_RISK_COLOR[nar.riskAssessment] || C.t3} />
                      {nar.status === "PENDING" && <Pill t="Pending review" c={C.am} />}
                      {(nar.status === "APPROVED" || nar.status === "APPROVED_WITH_OVERRIDE") && <Pill t="Accepted" c={C.gn} />}
                      {nar.status === "REJECTED" && <Pill t="Rejected" c={C.rd} />}
                      {nar.degraded && <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }} title="Claude was unavailable — deterministic fallback">⚙ fallback</span>}
                      {nar.confidence != null && <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>{Math.round(nar.confidence * 100)}% conf</span>}
                    </div>
                    {nar.headline && <div style={{ fontSize: 11, fontWeight: 600, color: C.t1, marginBottom: 4 }}>{nar.headline}</div>}
                    <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.55, marginBottom: nar.keyPoints?.length ? 6 : 0 }}>{nar.narrative}</div>
                    {nar.keyPoints?.length > 0 && (
                      <ul style={{ margin: "0 0 2px", paddingLeft: 16 }}>
                        {nar.keyPoints.map((p, i) => <li key={i} style={{ fontSize: 10, color: C.tl, lineHeight: 1.5 }}>{p}</li>)}
                      </ul>
                    )}
                    {nar.status === "PENDING" ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                        {canManage ? (
                          <>
                            <button disabled={narBusy} onClick={() => resolveNar("approve")} style={btn(C.gn)}>Approve</button>
                            <button disabled={narBusy} onClick={() => resolveNar("reject")} style={btn(C.rd)}>Reject</button>
                            <button disabled={narBusy} onClick={genNarrative} style={btn(C.t3)}>Regenerate</button>
                          </>
                        ) : (
                          <span style={{ fontSize: 9.5, fontFamily: M, color: C.t4 }}>Awaiting reviewer approval — AI output is advisory until accepted.</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 6 }}>
                        {nar.status === "REJECTED" ? "Rejected" : "Accepted"}{nar.approvedByName ? ` · ${nar.approvedByName}` : ""} · chain-sealed
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
