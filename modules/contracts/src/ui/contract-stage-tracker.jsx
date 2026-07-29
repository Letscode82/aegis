import { C, F, M } from "@aegis/ui";

// ── The 7-stage CLM lifecycle, made explicit (CTR-7) ─────────────────
//
// Icertis / Ironclad both present contracts as a 7-stage journey:
// Request → Draft → Negotiate → Approve → Execute → Active → Renew.
// AEGIS's 8-state ContractStatus machine maps onto those seven stages so
// the same journey is visible the moment a user opens the Contracts module
// (pipeline strip on the repository) and on every contract (full stepper).
//
// This module is presentation-only — it derives everything from `status`,
// which the workspace and repository rows already carry. No new endpoint.

export const CONTRACT_STAGES = [
  { key: "request", label: "Request", hint: "Intake / requested" },
  { key: "draft", label: "Draft", hint: "Authoring the terms" },
  { key: "negotiate", label: "Negotiate", hint: "Counterparty turns + redline" },
  { key: "approve", label: "Approve", hint: "Review & sign-off ladder" },
  { key: "execute", label: "Execute", hint: "Capture signatures" },
  { key: "active", label: "Active", hint: "Obligations & compliance" },
  { key: "renew", label: "Renew / Close", hint: "Renewal / expiry" },
];

// status → the stage the contract currently sits in (0-indexed).
// Request (0) is always complete once the contract exists — it was created.
const STATUS_STAGE = {
  DRAFT: 1,
  IN_NEGOTIATION: 2,
  IN_REVIEW: 3,
  APPROVED: 4,       // approval done — next action is signature
  EXECUTED: 4,       // signed — sits at Execute until activated
  ACTIVE: 5,
  EXPIRED: 6,
  TERMINATED: 6,     // off-ramp — rendered with a red end-cap
};

export function stageIndexForStatus(status) {
  return STATUS_STAGE[status] ?? 1;
}

// Tally contracts into the 7 stage buckets for the repository pipeline strip.
export function stageCounts(contracts) {
  const counts = CONTRACT_STAGES.map(() => 0);
  for (const c of contracts || []) counts[stageIndexForStatus(c.status)] += 1;
  return counts;
}

const isTerminated = (s) => s === "TERMINATED";
const isExpired = (s) => s === "EXPIRED";

// Full horizontal stepper for the contract workspace.
export function ContractStageTracker({ status }) {
  const cur = stageIndexForStatus(status);
  const term = isTerminated(status);
  const exp = isExpired(status);
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, fontFamily: F, overflowX: "auto" }}>
      {CONTRACT_STAGES.map((st, i) => {
        const done = i < cur;
        const active = i === cur;
        const endCap = active && (term || exp);
        const color = endCap ? (term ? C.rd : C.am) : done ? C.gn : active ? C.cy : C.t4;
        const label = endCap ? (term ? "Terminated" : "Expired") : st.label;
        return (
          <div key={st.key} title={st.hint} style={{ flex: "1 1 0", minWidth: 84, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", padding: "2px 4px" }}>
            {i > 0 && <div style={{ position: "absolute", top: 11, left: "-50%", width: "100%", height: 2, background: done || active ? C.gn : `${C.br}` }} />}
            <div style={{
              width: 22, height: 22, borderRadius: "50%", zIndex: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontFamily: M, fontWeight: 700,
              color: done || active ? C.bg : C.t3,
              background: done || active ? color : C.cd,
              border: `2px solid ${done || active ? color : C.br}`,
              boxShadow: active ? `0 0 0 3px ${color}33` : "none",
            }}>{done ? "✓" : i + 1}</div>
            <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .3, marginTop: 5, textAlign: "center", lineHeight: 1.2, color: active ? color : done ? C.t2 : C.t4, fontWeight: active ? 700 : 500 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// Compact 7-segment indicator + current-stage label for repository rows.
export function ContractStageDots({ status }) {
  const cur = stageIndexForStatus(status);
  const term = isTerminated(status);
  const exp = isExpired(status);
  const curColor = term ? C.rd : exp ? C.am : C.cy;
  const label = term ? "Terminated" : exp ? "Expired" : CONTRACT_STAGES[cur].label;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={`Stage ${cur + 1}/7 · ${label}`}>
      <span style={{ display: "inline-flex", gap: 2 }}>
        {CONTRACT_STAGES.map((_, i) => (
          <span key={i} style={{ width: 7, height: 4, borderRadius: 1, background: i < cur ? C.gn : i === cur ? curColor : `${C.br}` }} />
        ))}
      </span>
      <span style={{ fontFamily: M, fontSize: 9, color: curColor, letterSpacing: .3 }}>{label}</span>
    </span>
  );
}
