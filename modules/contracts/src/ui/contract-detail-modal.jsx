import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { ContractStageTracker } from "./contract-stage-tracker.jsx";
import { ApprovalLadderPanel } from "./approval-ladder-panel.jsx";
import { ApprovalWizard } from "./approval-wizard.jsx";
import { ContractCommentsPanel } from "./contract-comments-panel.jsx";
import { ReviewAssessmentPanel } from "./review-assessment-panel.jsx";

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

function KeyTerm({ label, children }) {
  return (
    <div style={{ padding: "8px 10px", background: C.s1, borderRadius: 6 }}>
      <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t4, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export function ContractDetailModal({ contractId, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [playbook, setPlaybook] = useState({}); // clauseType -> entry
  const [openClause, setOpenClause] = useState(null);
  const [remClauseId, setRemClauseId] = useState(null); // clause being remediated (Phase 5b)
  const [editingDetails, setEditingDetails] = useState(false); // header metadata edit (Phase 5c)
  const [editClauseId, setEditClauseId] = useState(null); // clause being hand-edited (Phase 6c)
  const [addingClause, setAddingClause] = useState(false); // add-clause form (Phase 6c)
  const [showApprovalWizard, setShowApprovalWizard] = useState(false); // guided approval (CTR-8)

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/contracts/${contractId}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setData(d.contract))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  // Full-page workspace (Phase 6a): Escape returns to the list.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div style={{ fontFamily: F, background: C.bg, minHeight: "100%" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.bg, borderBottom: `1px solid ${C.br}`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <span onClick={onClose} style={{ cursor: "pointer", fontSize: 11, fontFamily: M, letterSpacing: .5, color: C.bl, textTransform: "uppercase", fontWeight: 600 }}>← Back to contracts</span>
        {c && <span style={{ fontSize: 11, color: C.t4, fontFamily: M, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {c.title}</span>}
      </div>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
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
                    {c.origin === "THIRD_PARTY" && <Pill t="3rd-party paper" c={C.am} />}
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
                  <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                    <a href={`/api/contracts/${contractId}/document`} title="Download this contract as a Word (.docx) document" style={{ fontSize: 10, fontFamily: M, color: C.bl, letterSpacing: 1, textDecoration: "none" }}>⬇ WORD</a>
                    {canManage && <span onClick={() => setEditingDetails((v) => !v)} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: editingDetails ? C.cy : C.t3, letterSpacing: 1 }}>✎ EDIT</span>}
                    <span onClick={onClose} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1 }}>✕ CLOSE</span>
                  </div>
                </div>
              </div>
              {editingDetails && <EditDetailsPanel contract={c} onSaved={() => { setEditingDetails(false); load(); }} onCancel={() => setEditingDetails(false)} />}
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: M, color: C.t3 }}>
                <span>Effective <span style={{ color: C.t1 }}>{fmtDate(c.effectiveDate)}</span></span>
                <span>Expires <span style={{ color: c.daysToExpiry != null && c.daysToExpiry <= 90 ? C.am : C.t1 }}>{fmtDate(c.expiryDate)}</span>{c.daysToExpiry != null && <span style={{ color: c.daysToExpiry < 0 ? C.rd : c.daysToExpiry <= 90 ? C.am : C.t4 }}> ({c.daysToExpiry < 0 ? `${-c.daysToExpiry}d ago` : `${c.daysToExpiry}d`})</span>}</span>
                {c.autoRenew && <span style={{ color: C.am }}>⟳ Auto-renew{c.noticeWindowDays ? ` · ${c.noticeWindowDays}d notice` : ""}</span>}
              </div>
            </div>

            {/* 7-stage CLM lifecycle tracker (Phase CTR-7) */}
            <div style={{ padding: "14px 22px", borderBottom: `1px solid ${C.br}`, background: C.s1 }}>
              <ContractStageTracker status={c.status} />
            </div>

            {/* Key terms — structured pricing / scope / term / parties (Phase 6b) */}
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>Key terms</div>
                {canManage && <span onClick={() => setEditingDetails(true)} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.cy, textTransform: "uppercase" }}>✎ Edit key terms</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <KeyTerm label="Parties">
                  <div style={{ fontSize: 11, color: C.t1 }}>AEGIS <span style={{ color: C.t4 }}>↔</span> {c.counterpartyName || <span style={{ color: C.am }}>— set counterparty —</span>}</div>
                </KeyTerm>
                <KeyTerm label="Pricing">
                  <div style={{ fontSize: 11, color: C.t1 }}>{money(c.value, c.currency)} <span style={{ color: C.t4, fontFamily: M, fontSize: 9 }}>{c.currency}</span></div>
                  <div style={{ fontSize: 10, color: c.paymentTerms ? C.t2 : C.t4, marginTop: 2 }}>{c.paymentTerms || "— payment terms —"}</div>
                </KeyTerm>
                <KeyTerm label="Term">
                  <div style={{ fontSize: 10.5, color: C.t2 }}>{fmtDate(c.effectiveDate)} → {fmtDate(c.expiryDate)}</div>
                  <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>{c.autoRenew ? `Auto-renew${c.noticeWindowDays ? ` · ${c.noticeWindowDays}d notice` : ""}` : "No auto-renew"}</div>
                </KeyTerm>
                <KeyTerm label="Governing law">
                  <div style={{ fontSize: 11, color: c.governingLaw ? C.t1 : C.t4 }}>{c.governingLaw || "— not set —"}</div>
                </KeyTerm>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t4, marginBottom: 3 }}>Scope of services</div>
                <div style={{ fontSize: 11, color: c.scopeOfServices ? C.t2 : C.t4, lineHeight: 1.55, fontStyle: c.scopeOfServices ? "normal" : "italic" }}>
                  {c.scopeOfServices || "No scope entered yet — click ✎ Edit key terms to add the scope of services."}
                </div>
              </div>
            </div>

            {/* CLM lifecycle — advance controls + timeline (Phase 1b) */}
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.br}`, background: C.s1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>Lifecycle <span style={{ color: C.tl }}>· {STATUS_LABEL[c.status] || c.status}</span></span>
                  {canManage && (c.status === "DRAFT" || c.status === "IN_NEGOTIATION") && (
                    <button onClick={() => setShowApprovalWizard(true)} style={{ padding: "5px 11px", background: C.bl, color: "#fff", border: `1px solid ${C.bl}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", cursor: "pointer" }}>▸ Submit for approval (guided)</button>
                  )}
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
              {(c.status === "IN_REVIEW" || c.status === "APPROVED") && (
                <ApprovalLadderPanel contractId={contractId} contractStatus={c.status} onChanged={load} />
              )}
            </div>

            {/* Execution & signatures (Phase 5d) */}
            <SignaturesPanel contractId={contractId} canManage={canManage} counterpartyName={c.counterpartyName} onChanged={load} />

            {/* Review assessment — what to sign / clauses we're not comfortable with (CTR-13) */}
            <ReviewAssessmentPanel contractId={contractId} isThirdParty={c.origin === "THIRD_PARTY"} />

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
                {canManage && !addingClause && <button onClick={() => setAddingClause(true)} style={btn(C.tl)}>+ Add clause</button>}
              </div>
              {addingClause && <ClauseEditForm contractId={contractId} onDone={() => { setAddingClause(false); load(); }} onCancel={() => setAddingClause(false)} />}
              {c.clauses.length === 0 && !addingClause ? (
                <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No clauses yet. Extract them from the draft (✎ Edit draft / scope) or <b style={{ color: C.tl }}>+ Add clause</b> by hand.</div>
              ) : c.clauses.map((cl) => {
                const pb = playbook[cl.type];
                const open = openClause === cl.id;
                return (
                <div key={cl.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.br}22` }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t1 }}>{cl.type.replace(/_/g, " ")}</span>
                    <Pill t={cl.risk} c={RISK_COLOR[cl.risk]} />
                    {cl.deviation && <Pill t="DEVIATES" c={C.rd} />}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                      {canManage && (cl.deviation || cl.risk === "HIGH") && (
                        <span onClick={() => setRemClauseId(remClauseId === cl.id ? null : cl.id)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.am, textTransform: "uppercase" }}>
                          {remClauseId === cl.id ? "▾ fix" : "⚡ fix clause"}
                        </span>
                      )}
                      {pb && (
                        <span onClick={() => setOpenClause(open ? null : cl.id)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.bl, textTransform: "uppercase" }}>
                          {open ? "▾ playbook" : "⚖ vs playbook"}
                        </span>
                      )}
                      {canManage && (
                        <span onClick={() => setEditClauseId(editClauseId === cl.id ? null : cl.id)} title="Edit clause" style={{ cursor: "pointer", fontSize: 9, fontFamily: M, letterSpacing: .5, color: C.cy, textTransform: "uppercase" }}>
                          {editClauseId === cl.id ? "▾ edit" : "✎ edit"}
                        </span>
                      )}
                    </span>
                  </div>
                  {editClauseId === cl.id ? (
                    <ClauseEditForm contractId={contractId} clause={cl} onDone={() => { setEditClauseId(null); load(); }} onCancel={() => setEditClauseId(null)} />
                  ) : (
                    <>
                      {cl.summary && <div style={{ fontSize: 10.5, color: C.tl, marginBottom: 2 }}>{cl.summary}</div>}
                      <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.5 }}>{cl.text}</div>
                    </>
                  )}
                  {remClauseId === cl.id && (
                    <ClauseRemediationPanel contractId={contractId} clause={cl} onDone={() => { setRemClauseId(null); load(); }} />
                  )}
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
              {canManage && <ReExtractPanel contractId={contractId} draftText={c.draftText} onDone={load} />}
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

            {/* Turn-based negotiation (CLM Phase 4b) */}
            <NegotiationPanel contractId={contractId} canManage={canManage} draftText={c.draftText} onApplied={load} />

            {/* Version history + redline diff (CTR-5b) */}
            <VersionsPanel contractId={contractId} canManage={canManage} />

            {/* Collaboration — business ↔ legal (internal) + ↔ counterparty (shared) (CTR-10) */}
            <ContractCommentsPanel contractId={contractId} canManage={canManage} />
          </>
        )}
      </div>

      {/* Guided approval wizard (CTR-8) */}
      {showApprovalWizard && data && (
        <ApprovalWizard
          contract={data}
          contractId={contractId}
          onClose={() => { setShowApprovalWizard(false); load(); onChanged?.(); }}
          onSubmitted={() => { load(); onChanged?.(); }}
        />
      )}
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

// ── Execution & signatures (CLM Phase 5d) ────────────────────────────
// Record who signed for each side; both sides + APPROVED auto-executes the
// contract (guarded transition → EXECUTED). Not an e-signature integration —
// a defensible signature record.
function SignaturesPanel({ contractId, canManage, counterpartyName, onChanged }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(null); // "INTERNAL" | "COUNTERPARTY" | null
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/signatures`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setState(d.state))
      .catch((e) => setErr(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const startAdd = (party) => { setAdding(party); setName(party === "COUNTERPARTY" ? "" : ""); setEmail(""); setErr(null); };

  const record = async () => {
    if (!name.trim()) { setErr("Signer name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/signatures`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party: adding, signerName: name.trim(), signerEmail: email.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setState(d.state); setAdding(null); setName(""); setEmail("");
      if (d.state.status === "EXECUTED") onChanged?.(); // executed → refresh the whole contract
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const remove = async (signatureId) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/signatures`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setState(d.state);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const sigOf = (party) => state?.signatures.find((s) => s.party === party);
  const Row = ({ party, label }) => {
    const s = sigOf(party);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.br}22` }}>
        <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, minWidth: 92 }}>{label}</span>
        {s ? (
          <>
            <span style={{ fontSize: 11, color: C.gn }}>✓ {s.signerName}{s.signerEmail ? ` · ${s.signerEmail}` : ""}</span>
            <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{fmtDate(s.signedAt)} · {s.method}</span>
            {canManage && state.status !== "EXECUTED" && state.status !== "ACTIVE" && <button disabled={busy} onClick={() => remove(s.id)} style={{ ...btn(C.rd), marginLeft: "auto" }}>Remove</button>}
          </>
        ) : canManage ? (
          adding === party ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${label} signer name`} style={{ flex: "1 1 120px", minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "5px 7px" }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (opt)" style={{ flex: "1 1 120px", minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "5px 7px" }} />
              <button disabled={busy || !name.trim()} onClick={record} style={btn(C.gn)}>Sign</button>
              <button disabled={busy} onClick={() => setAdding(null)} style={btn(C.t3)}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => startAdd(party)} style={{ ...btn(C.tl), marginLeft: "auto" }}>Record signature</button>
          )
        ) : <span style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic" }}>Not signed</span>}
      </div>
    );
  };

  return (
    <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>Execution &amp; signatures</div>
        {state && (state.status === "EXECUTED" || state.status === "ACTIVE"
          ? <Pill t={`Executed${state.executedAt ? " " + fmtDate(state.executedAt) : ""}`} c={C.gn} />
          : state.bothSigned ? <Pill t="Both signed" c={C.gn} /> : <Pill t={`${state.signatures.length}/2 signed`} c={C.am} />)}
      </div>
      {err && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 6 }}>⚠ {err}</div>}
      {!state ? <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>Loading…</div> : (
        <>
          <Row party="INTERNAL" label="AEGIS / us" />
          <Row party="COUNTERPARTY" label={counterpartyName || "Counterparty"} />
          {state.blockedReason && state.status !== "EXECUTED" && state.status !== "ACTIVE" && (
            <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>{state.blockedReason} {state.bothSigned && state.status !== "APPROVED" ? "Advance the lifecycle to Approved, then the final signature executes it." : ""}</div>
          )}
          {state.canExecute && (
            <div style={{ fontSize: 10, color: C.gn, marginTop: 8 }}>Both parties signed and the contract is Approved — recording the final signature executed it automatically.</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Edit contract metadata (CLM Phase 5c) ────────────────────────────
// Chain-sealed PATCH of the header fields. Status is NOT here — it moves
// only through the guarded lifecycle controls.
function EditDetailsPanel({ contract, onSaved, onCancel }) {
  const c = contract;
  const [counterparties, setCounterparties] = useState([]);
  const [f, setF] = useState({
    title: c.title || "", type: c.type || "", counterpartyId: c.counterpartyId || "",
    value: c.value ?? "", currency: c.currency || "USD", governingLaw: c.governingLaw || "",
    effectiveDate: c.effectiveDate ? c.effectiveDate.slice(0, 10) : "",
    expiryDate: c.expiryDate ? c.expiryDate.slice(0, 10) : "",
    autoRenew: !!c.autoRenew, noticeWindowDays: c.noticeWindowDays ?? "",
    paymentTerms: c.paymentTerms || "", scopeOfServices: c.scopeOfServices || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetch("/api/contracts/counterparties").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.ok) setCounterparties(d.counterparties || []); }).catch(() => {});
  }, []);

  const save = async () => {
    if (!f.title.trim()) { setErr("Title is required."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim(), type: f.type.trim(),
          counterpartyId: f.counterpartyId || null,
          value: f.value === "" ? null : Number(f.value),
          currency: f.currency, governingLaw: f.governingLaw.trim() || null,
          effectiveDate: f.effectiveDate || null, expiryDate: f.expiryDate || null,
          autoRenew: f.autoRenew, noticeWindowDays: f.noticeWindowDays === "" ? null : Number(f.noticeWindowDays),
          paymentTerms: f.paymentTerms.trim() || null, scopeOfServices: f.scopeOfServices.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved?.();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const inp = { width: "100%", padding: "6px 8px", fontSize: 11, fontFamily: F, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, boxSizing: "border-box" };
  const lb = { fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t4, marginBottom: 3, display: "block" };
  return (
    <div style={{ marginTop: 10, padding: "12px 14px", background: C.s1, borderRadius: 6, border: `1px solid ${C.cy}44` }}>
      <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Edit contract details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}><label style={lb}>Title</label><input value={f.title} onChange={(e) => set("title", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Type</label><input value={f.type} onChange={(e) => set("type", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Counterparty</label>
          <select value={f.counterpartyId} onChange={(e) => set("counterpartyId", e.target.value)} style={inp}>
            <option value="">— None —</option>
            {counterparties.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
          </select>
        </div>
        <div><label style={lb}>Value</label><input type="number" value={f.value} onChange={(e) => set("value", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Currency</label>
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} style={inp}>{["USD", "EUR", "GBP"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </div>
        <div><label style={lb}>Effective date</label><input type="date" value={f.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Expiry date</label><input type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Governing law</label><input value={f.governingLaw} onChange={(e) => set("governingLaw", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Notice window (days)</label><input type="number" value={f.noticeWindowDays} onChange={(e) => set("noticeWindowDays", e.target.value)} style={inp} /></div>
        <div><label style={lb}>Payment terms</label><input value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Net 45" style={inp} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "end" }}>
          <input id="autoRenew" type="checkbox" checked={f.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} />
          <label htmlFor="autoRenew" style={{ fontSize: 10.5, color: C.t2 }}>Auto-renew</label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}><label style={lb}>Scope of services</label>
          <textarea value={f.scopeOfServices} onChange={(e) => set("scopeOfServices", e.target.value)} placeholder="Concise scope-of-services summary…" style={{ ...inp, minHeight: 70, resize: "vertical", fontFamily: F }} />
        </div>
      </div>
      {err && <div style={{ fontSize: 10, color: C.rd, fontFamily: M, marginTop: 8 }}>⚠ {err}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button disabled={busy} onClick={save} style={btn(C.gn)}>{busy ? "Saving…" : "Save changes"}</button>
        <button disabled={busy} onClick={onCancel} style={btn(C.t3)}>Cancel</button>
      </div>
    </div>
  );
}

function ReviewPanel({ contractId, canManage }) {
  const [act, setAct] = useState(null);
  const [err, setErr] = useState(null);
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshLink, setFreshLink] = useState(null);
  const [addingContact, setAddingContact] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");

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
  const addContact = async () => {
    if (!cName.trim()) { setErr("Contact name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/contacts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cName.trim(), email: cEmail.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCName(""); setCEmail(""); setAddingContact(false);
      setPersonId(d.contact.personId); // preselect the new contact for inviting
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
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {act.availableContacts.length === 0 ? (
                  <span style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic" }}>No counterparty contacts yet.</span>
                ) : (
                  <>
                    <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }}>
                      <option value="">Select a contact…</option>
                      {act.availableContacts.map((p) => <option key={p.personId} value={p.personId}>{p.name}{p.email ? ` (${p.email})` : ""}</option>)}
                    </select>
                    <button disabled={busy || !personId} onClick={invite} style={{ ...btn(C.cy), opacity: !personId ? 0.5 : 1 }}>Invite to review</button>
                  </>
                )}
                {!addingContact && <button onClick={() => { setAddingContact(true); setErr(null); }} style={btn(C.tl)}>+ Add contact</button>}
              </div>

              {addingContact && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: C.s1, borderRadius: 5 }}>
                  <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 6 }}>New counterparty contact</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Full name" style={{ flex: "1 1 140px", minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }} />
                    <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="email (optional)" style={{ flex: "1 1 160px", minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }} />
                    <button disabled={busy || !cName.trim()} onClick={addContact} style={{ ...btn(C.gn), opacity: !cName.trim() ? .5 : 1 }}>Save</button>
                    <button disabled={busy} onClick={() => { setAddingContact(false); setErr(null); }} style={btn(C.t3)}>Cancel</button>
                  </div>
                  <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 5 }}>Linked to this contract's counterparty. Then Invite them to review.</div>
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

// ── Turn-based negotiation (CLM Phase 4b) ────────────────────────────
//
// The internal side of the counterparty round-trip: when a counterparty
// counters, the attorney applies their proposed changes to the working draft
// here. Each apply re-extracts the clause set into a new COUNTERPARTY version
// (a "turn"), so the Versions panel's redline — and the AI change summary —
// show exactly what moved this round. Nothing auto-accepts; the attorney
// still drives approve/execute through the lifecycle controls.
function NegotiationPanel({ contractId, canManage, draftText, onApplied }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/negotiation`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setState(d.state))
      .catch((e) => setErr(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const startTurn = () => {
    setText(state?.draftText || draftText || "");
    setApplied(null);
    setEditing(true);
  };

  const applyTurn = async () => {
    if (!text.trim()) { setErr("Revised draft text is required."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/negotiation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftText: text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setApplied(d);
      setEditing(false);
      load();
      onApplied?.();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const cp = state?.lastCounterparty;
  const cpCountered = cp && cp.action === "contract.review.countered";

  return (
    <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.br}` }}>
      <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>
        Negotiation {state && <span style={{ color: C.t4 }}>· {state.turnCount} turn{state.turnCount === 1 ? "" : "s"}</span>}
      </div>
      {err && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 8 }}>⚠ {err}</div>}
      {!state ? <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>Loading…</div> : (
        <>
          {cp && (
            <div style={{ padding: "8px 10px", borderRadius: 5, marginBottom: 10, background: C.s1, borderLeft: `2px solid ${cpCountered ? C.am : C.bl}` }}>
              <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: cpCountered ? C.am : C.bl, marginBottom: 3 }}>
                {cpCountered ? "Counterparty proposed changes" : "Counterparty comment"}
              </div>
              <div style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.5 }}>
                <b style={{ color: C.t1 }}>{cp.personName || "Counterparty"}</b>{cp.comment ? ` — “${cp.comment}”` : ""}
              </div>
            </div>
          )}

          {state.turns.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {state.turns.map((t) => (
                <div key={t.version} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0", fontSize: 10.5 }}>
                  <span style={{ fontFamily: M, color: C.am, minWidth: 28 }}>v{t.version}</span>
                  <span style={{ color: C.t2, flex: 1 }}>{t.label}</span>
                  <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>{relTime(t.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {applied && (
            <div style={{ fontSize: 10.5, color: C.gn, marginBottom: 8 }}>
              ✓ Turn {applied.turn} applied — v{applied.newVersion ?? "?"} · {applied.clauseCount} clause{applied.clauseCount === 1 ? "" : "s"}, {applied.deviationCount} deviating. Compare it in Version history below (and generate the AI change summary).
            </div>
          )}

          {canManage && !editing && (
            <button onClick={startTurn} style={btn(cpCountered ? C.am : C.tl)}>
              {cpCountered ? "Apply counterparty changes →" : "Record a negotiation turn"}
            </button>
          )}

          {editing && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginBottom: 6 }}>
                Edit the working draft to incorporate the counterparty's changes, then apply. This re-extracts the clauses into a new turn version — the redline shows what moved.
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Revised contract draft text…"
                style={{ width: "100%", minHeight: 150, resize: "vertical", padding: "8px 10px", fontSize: 11, fontFamily: F, lineHeight: 1.5, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button disabled={busy || !text.trim()} onClick={applyTurn} style={{ ...btn(C.am), opacity: busy || !text.trim() ? .5 : 1 }}>
                  {busy ? "Applying…" : "Apply turn"}
                </button>
                <button disabled={busy} onClick={() => { setEditing(false); setErr(null); }} style={btn(C.t3)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── AI clause remediation (CLM Phase 5b) ─────────────────────────────
//
// For a deviating / high-risk clause, generate a fix from the playbook
// (standard/fallback), agreeable precedent (prior non-deviating clauses of
// the same type), and an AI redline. Human-gated: the suggestion is a PENDING
// AgentDecision; Accept applies it (optionally an operator-chosen option),
// marks the clause non-deviating, downgrades risk, and snapshots a version.
// ── Human-owned clause add / edit / delete (CLM Phase 6c) ────────────
// Direct control over the clause set: add a clause by type, edit any clause's
// text / risk / deviation, or delete it. Chain-sealed; each change snapshots a
// version and re-scores the contract risk.
const CLAUSE_TYPES = [
  "LIABILITY_CAP", "INDEMNITY", "IP", "PAYMENT", "AUTO_RENEWAL", "TERMINATION",
  "GOVERNING_LAW", "CONFIDENTIALITY", "ASSIGNMENT", "WARRANTY", "OTHER",
];
function ClauseEditForm({ contractId, clause, onDone, onCancel }) {
  const editing = !!clause;
  const [type, setType] = useState(clause?.type || "CONFIDENTIALITY");
  const [text, setText] = useState(clause?.text || "");
  const [risk, setRisk] = useState(clause?.risk || "LOW");
  const [deviation, setDeviation] = useState(!!clause?.deviation);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!text.trim()) { setErr("Clause text is required."); return; }
    setBusy(true); setErr(null);
    try {
      const url = editing ? `/api/contracts/${contractId}/clauses/${clause.id}` : `/api/contracts/${contractId}/clauses`;
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, text: text.trim(), risk, deviation }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDone?.();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  const del = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/clauses/${clause.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDone?.();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  const inp = { background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: M, fontSize: 10.5, padding: "5px 7px" };
  return (
    <div style={{ marginTop: 6, marginBottom: 6, padding: "10px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.cy}44` }}>
      <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>{editing ? "Edit clause" : "Add clause"}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={inp}>{CLAUSE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
        <select value={risk} onChange={(e) => setRisk(e.target.value)} style={inp}>{["LOW", "MEDIUM", "HIGH"].map((r) => <option key={r} value={r}>{r} risk</option>)}</select>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.t2 }}>
          <input type="checkbox" checked={deviation} onChange={(e) => setDeviation(e.target.checked)} /> Deviates from playbook
        </label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Clause language…" style={{ width: "100%", minHeight: 80, resize: "vertical", padding: "7px 9px", fontSize: 11, fontFamily: F, lineHeight: 1.5, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, boxSizing: "border-box" }} />
      {err && <div style={{ fontSize: 10, color: C.rd, fontFamily: M, marginTop: 6 }}>⚠ {err}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button disabled={busy || !text.trim()} onClick={save} style={btn(C.gn)}>{busy ? "Saving…" : editing ? "Save clause" : "Add clause"}</button>
        <button disabled={busy} onClick={onCancel} style={btn(C.t3)}>Cancel</button>
        {editing && <button disabled={busy} onClick={del} style={{ ...btn(C.rd), marginLeft: "auto" }}>🗑 Delete</button>}
      </div>
    </div>
  );
}

function ClauseRemediationPanel({ contractId, clause, onDone }) {
  const [rem, setRem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [text, setText] = useState("");       // editable replacement text (Phase 6c)

  const gen = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      // Load any existing suggestion first; generate if none.
      let r = await fetch(`/api/contracts/${contractId}/clauses/${clause.id}/remediation`);
      let d = await r.json();
      if (!(d?.ok && d.remediation && d.remediation.status === "PENDING")) {
        r = await fetch(`/api/contracts/${contractId}/clauses/${clause.id}/remediation`, { method: "POST" });
        d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      }
      setRem(d.remediation);
      if (d.remediation?.status === "PENDING") setText(d.remediation.suggestedText || "");
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  }, [contractId, clause.id]);
  useEffect(() => { gen(); }, [gen]);

  const resolve = async (action) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/clauses/${clause.id}/remediation/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: rem.id, action, chosenText: action === "approve" ? text : null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onDone?.();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  const box = { marginTop: 8, padding: "10px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.am}44` };
  if (busy && !rem) return <div style={box}><span style={{ fontSize: 10, fontFamily: M, color: C.t3 }}>⚡ Analyzing clause…</span></div>;
  if (err) return <div style={box}><span style={{ fontSize: 10, color: C.rd, fontFamily: M }}>⚠ {err}</span></div>;
  if (!rem) return null;

  const resolved = rem.status !== "PENDING";

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.am }}>Suggested fix</span>
        <Pill t={`basis: ${rem.basis}`} c={C.tl} />
        {resolved && <Pill t={rem.status === "REJECTED" ? "Rejected" : "Applied"} c={rem.status === "REJECTED" ? C.rd : C.gn} />}
        {rem.degraded && <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }} title="Claude unavailable — playbook/precedent fallback">⚙ fallback</span>}
        {rem.confidence != null && <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>{Math.round(rem.confidence * 100)}% conf</span>}
      </div>
      {resolved ? (
        <div style={{ fontSize: 10.5, color: C.t1, lineHeight: 1.55, padding: "6px 8px", background: C.bg, borderRadius: 4, borderLeft: `2px solid ${C.gn}` }}>{rem.appliedText || rem.suggestedText}</div>
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", minHeight: 90, resize: "vertical", padding: "6px 8px", fontSize: 10.5, fontFamily: F, lineHeight: 1.55, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderLeft: `2px solid ${C.gn}`, borderRadius: 4, boxSizing: "border-box" }} />
      )}
      {rem.rationale && <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginTop: 5 }}>{rem.rationale}</div>}

      {!resolved && rem.options?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t4, marginBottom: 4 }}>Load an option into the editor</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span onClick={() => setText(rem.suggestedText || "")} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, padding: "3px 8px", borderRadius: 3, border: `1px solid ${C.br}`, color: C.t3 }}>AI suggestion</span>
            {rem.options.map((o, i) => (
              <span key={i} onClick={() => setText(o.text)} title={o.text} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, padding: "3px 8px", borderRadius: 3, border: `1px solid ${C.br}`, color: C.t3 }}>{o.label}</span>
            ))}
          </div>
        </div>
      )}

      {!resolved && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <button disabled={busy || !text.trim()} onClick={() => resolve("approve")} style={btn(C.gn)}>Accept &amp; apply</button>
          <button disabled={busy} onClick={() => resolve("reject")} style={btn(C.rd)}>Reject</button>
          <button disabled={busy} onClick={gen} style={btn(C.t3)}>Regenerate</button>
          <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>Edit the text before applying — it's yours to change.</span>
        </div>
      )}
    </div>
  );
}

// ── Draft / scope-of-services editor (CLM Phase 5c; supersedes the 3a
//    "re-extract from amended text" box) ──────────────────────────────
//
// Edit the working draft body — including the scope of services — prefilled
// with the current draftText. Saving PERSISTS the body (PUT /draft) and
// re-runs the playbook extractor, snapshotting a new version so the clause
// analysis + risk score stay in sync with the text. Obligations are left
// intact (they carry human-set owners / due dates / lifecycle status).
function ReExtractPanel({ contractId, draftText, onDone }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const start = () => { setText(draftText || ""); setResult(null); setErr(null); setOpen(true); };

  const run = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftText: text }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
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
        <span onClick={start} style={{ cursor: "pointer", fontSize: 9.5, fontFamily: M, letterSpacing: .5, color: C.cy, textTransform: "uppercase" }}>
          ✎ Edit draft / scope of services
        </span>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: C.s1, borderRadius: 6, border: `1px solid ${C.br}` }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>Edit draft / scope of services</span>
        <span onClick={() => { setOpen(false); setErr(null); setResult(null); }} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 9.5, fontFamily: M, color: C.t3 }}>✕</span>
      </div>
      <div style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginBottom: 8 }}>
        Edit the working draft (add a scope-of-services section, revise terms, paste a counter-signed version). Saving persists the body and re-runs the playbook extractor — a new version is snapshotted and the redline shows what changed. Obligations are left untouched.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Contract draft body — including scope of services…"
        style={{ width: "100%", minHeight: 150, resize: "vertical", padding: "8px 10px", fontSize: 11, fontFamily: F, lineHeight: 1.5, color: C.t1, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, boxSizing: "border-box" }}
      />
      {err && <div style={{ fontSize: 10, color: C.rd, marginTop: 6 }}>{err}</div>}
      {result && (
        <div style={{ fontSize: 10.5, color: C.gn, marginTop: 6 }}>
          Saved · re-extracted {result.clauseCount} clause{result.clauseCount === 1 ? "" : "s"} · {result.deviationCount} deviating
          {result.newVersion != null ? ` · new version v${result.newVersion} (see Version history below)` : " · no clause changes — no new version"}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button disabled={busy || !text.trim()} onClick={run} style={{ ...btn(C.cy), opacity: busy || !text.trim() ? 0.5 : 1 }}>
          {busy ? "Saving…" : "Save & re-extract"}
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
