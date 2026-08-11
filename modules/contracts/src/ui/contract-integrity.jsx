import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract integrity monitor (CTR-9) ───────────────────────────────
//
// Tamper-evidence for executed contracts. Every executed contract is verified:
// its live material-terms fingerprint is recomputed and compared to the SEALED
// baseline captured at execution. A mismatch = TAMPERED, and the drill-in shows
// the post-execution `contract.updated` audit rows — exactly what changed, when,
// and by whom. This is the surface that catches "someone changed the pricing
// after the client signed." Reads GET /api/contracts/integrity; the drill-in
// reads GET /api/contracts/[id]/integrity; POST seals an unsealed baseline.

const VERDICT = {
  SEALED:       { label: "Sealed",    c: C.gn, glyph: "🛡" },
  TAMPERED:     { label: "Tampered",  c: C.rd, glyph: "⚠" },
  UNSEALED:     { label: "Unsealed",  c: C.am, glyph: "○" },
  NOT_EXECUTED: { label: "Draft",     c: C.t4, glyph: "·" },
};
const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");
const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

function Kpi({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontFamily: SR, color: color || C.t1, marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const btn = (c) => ({ padding: "4px 9px", borderRadius: 4, border: `1px solid ${c}`, background: "transparent", color: c, fontSize: 9, fontFamily: M, fontWeight: 600, letterSpacing: .4, cursor: "pointer", textTransform: "uppercase" });

function IntegrityDrillIn({ contractId, canAmend, onClose, onOpenContract, onAmended }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/contracts/${contractId}/integrity`)
      .then((r) => (r.ok ? r.json() : r.json().then((x) => Promise.reject(x.error || `HTTP ${r.status}`))))
      .then((x) => setD(x.integrity))
      .catch((e) => setErr(String(e)));
  }, [contractId]);

  const amendable = d && (d.status === "ACTIVE" || d.status === "EXPIRED");
  const amend = async () => {
    const reason = window.prompt("Open an amendment to change the signed terms?\nThis unlocks the contract for editing — it then re-enters approval and re-signature, which re-seals a fresh integrity baseline.\n\nReason (optional):", "");
    if (reason === null) return; // cancelled
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/amend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      onAmended?.();
      onClose();
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const v = d ? (VERDICT[d.integrity] || VERDICT.NOT_EXECUTED) : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "100%", maxHeight: "86vh", overflow: "auto", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 20 }}>
        {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {err}</div>}
        {!d && !err && <div style={{ color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Verifying…</div>}
        {d && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{v.glyph}</span>
              <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
              <span style={{ fontSize: 9, fontFamily: M, color: v.c, border: `1px solid ${v.c}`, borderRadius: 4, padding: "3px 8px", textTransform: "uppercase", letterSpacing: .5 }}>{v.label}</span>
            </div>
            <div style={{ fontSize: 10, fontFamily: M, color: C.t3, marginBottom: 14 }}>Executed {fmtDate(d.executedAt)} · status {d.status}</div>

            {d.integrity === "TAMPERED" && (
              <div style={{ padding: "10px 12px", marginBottom: 14, background: C.rd + "14", border: `1px solid ${C.rd}55`, borderLeft: `3px solid ${C.rd}`, borderRadius: 5, fontSize: 11.5, fontFamily: F, color: C.t1, lineHeight: 1.45 }}>
                <b style={{ color: C.rd }}>Terms changed after signing.</b> The live contract no longer matches the fingerprint sealed at execution{d.changedFields.length > 0 && <> — altered fields: <b>{d.changedFields.join(", ")}</b></>}. The record below is chain-sealed and cannot be altered.
              </div>
            )}
            {d.integrity === "UNSEALED" && (
              <div style={{ padding: "10px 12px", marginBottom: 14, background: C.am + "14", border: `1px solid ${C.am}55`, borderRadius: 5, fontSize: 11, fontFamily: F, color: C.t2, lineHeight: 1.4 }}>
                Executed before integrity sealing — no baseline to verify against. Seal it to attest the current terms are the signed ones and enable tamper detection going forward.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ padding: "8px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5 }}>
                <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>Sealed at execution</div>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t2, marginTop: 3 }} title={d.executedTermsHash || ""}>{shortHash(d.executedTermsHash)}</div>
              </div>
              <div style={{ padding: "8px 10px", background: C.bg, border: `1px solid ${d.integrity === "TAMPERED" ? C.rd : C.br}`, borderRadius: 5 }}>
                <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase" }}>Live fingerprint</div>
                <div style={{ fontSize: 10, fontFamily: M, color: d.integrity === "TAMPERED" ? C.rd : C.t2, marginTop: 3 }} title={d.currentTermsHash}>{shortHash(d.currentTermsHash)}</div>
              </div>
            </div>

            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Signatures</div>
            {d.signatures.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginBottom: 12 }}>None recorded.</div> : (
              <div style={{ marginBottom: 14 }}>
                {d.signatures.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11, fontFamily: M, color: C.t2, borderBottom: `1px solid ${C.br}33` }}>
                    <span style={{ fontSize: 8.5, color: C.t3, border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 5px" }}>{s.party}</span>
                    <span style={{ flex: 1 }}>{s.signerName}</span>
                    <span style={{ color: C.t4 }}>{fmtDate(s.signedAt)}</span>
                    {s.hashMatchesLive === false && <span style={{ color: C.rd, fontSize: 8.5 }}>⚠ TERMS DIFFER</span>}
                    {s.hashMatchesLive === true && <span style={{ color: C.gn, fontSize: 8.5 }}>✓ MATCHES</span>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Post-execution changes ({d.postExecutionChanges.length})</div>
            {d.postExecutionChanges.length === 0 ? (
              <div style={{ fontSize: 11, color: C.gn, fontFamily: M }}>None — nothing was edited after execution.</div>
            ) : d.postExecutionChanges.map((ch, i) => (
              <div key={i} style={{ padding: "8px 10px", marginBottom: 6, background: C.bg, border: `1px solid ${ch.materialFields.length ? C.rd + "66" : C.br}`, borderRadius: 5 }}>
                <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3 }}>{fmtDate(ch.at)} · fields: <b style={{ color: ch.materialFields.length ? C.rd : C.t2 }}>{(ch.fields || []).join(", ") || "—"}</b></div>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t2, marginTop: 4, lineHeight: 1.5, wordBreak: "break-word" }}>
                  <span style={{ color: C.t4 }}>before:</span> {JSON.stringify(ch.before)}<br />
                  <span style={{ color: C.t4 }}>after:</span> {JSON.stringify(ch.after)}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, alignItems: "center" }}>
              {canAmend && amendable && (
                <button disabled={busy} onClick={amend} style={{ ...btn(C.am), padding: "7px 12px", marginRight: "auto" }} title="Unlock for a formal amendment (re-approval + re-signature)">⚖ Amend contract</button>
              )}
              <button onClick={() => onOpenContract?.(contractId)} style={btn(C.bl)}>Open contract</button>
              <button onClick={onClose} style={{ ...btn(C.t3), padding: "7px 13px" }}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ContractIntegrityMonitor({ onOpenContract }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [drill, setDrill] = useState(null);
  const [canSeal, setCanSeal] = useState(false);
  const [canAmend, setCanAmend] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/contracts/integrity")
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setReport(d.report))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/auth/current-user").then((r) => r.json()).then((d) => {
      const perms = d?.user?.permissions || [];
      setCanSeal(perms.includes("contracts:execute"));
      setCanAmend(perms.includes("contracts:approve"));
    }).catch(() => {});
  }, []);

  const seal = async (row) => {
    setBusy(row.contractId);
    try {
      const r = await fetch(`/api/contracts/${row.contractId}/integrity`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(null); }
  };

  if (error && !report) return <div style={{ padding: 24, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>;
  if (!report) return <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12, letterSpacing: 1 }}>◎ Verifying contract integrity…</div>;

  const { rows, counts } = report;

  return (
    <div>
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Kpi label="Executed" value={counts.total} />
        <Kpi label="Sealed" value={counts.sealed} color={C.gn} />
        <Kpi label="Tampered" value={counts.tampered} color={counts.tampered > 0 ? C.rd : C.t3} />
        <Kpi label="Unsealed" value={counts.unsealed} color={counts.unsealed > 0 ? C.am : C.t3} />
      </div>

      {counts.tampered > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, background: C.rd + "14", border: `1px solid ${C.rd}55`, borderLeft: `3px solid ${C.rd}`, borderRadius: 5 }}>
          <span style={{ fontSize: 15 }}>⚠</span>
          <div style={{ fontSize: 11.5, fontFamily: F, color: C.t1, lineHeight: 1.4 }}>
            <b style={{ color: C.rd }}>{counts.tampered} executed contract{counts.tampered === 1 ? "" : "s"}</b> had material terms changed after signing. Open each to see exactly what changed, when, and by whom — the record is chain-sealed.
          </div>
        </div>
      )}

      <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.4fr 110px 120px 1.8fr 150px", gap: 8, fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "0 4px 8px", borderBottom: `1px solid ${C.br}` }}>
          <span>Contract</span><span>Status</span><span>Integrity</span><span>Changed after signing</span><span>Actions</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 11 }}>No executed contracts yet.</div>
        ) : rows.map((row) => {
          const v = VERDICT[row.integrity] || VERDICT.NOT_EXECUTED;
          return (
            <div key={row.contractId} style={{ display: "grid", gridTemplateColumns: "2.4fr 110px 120px 1.8fr 150px", gap: 8, fontSize: 11, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C.br}33` }}>
              <span onClick={() => onOpenContract?.(row.contractId)} title={row.title} style={{ color: C.bl, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
              <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>{row.status}</span>
              <span style={{ fontFamily: M, fontSize: 9.5, color: v.c }}>{v.glyph} {v.label}</span>
              <span style={{ fontFamily: M, fontSize: 10, color: row.changedFields.length ? C.rd : C.t4 }}>{row.changedFields.length ? row.changedFields.join(", ") : "—"}</span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <button onClick={() => setDrill(row.contractId)} style={btn(C.bl)}>Verify</button>
                {canSeal && row.integrity === "UNSEALED" && <button disabled={busy === row.contractId} onClick={() => seal(row)} style={btn(C.am)} title="Attest the current terms are the signed ones">Seal</button>}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, marginTop: 12, letterSpacing: .3, lineHeight: 1.5 }}>
        Each executed contract's material terms (pricing, term, scope, governing law + clauses) are fingerprinted (SHA-256) at signing. <b style={{ color: C.gn }}>Sealed</b> = live terms match the signed fingerprint; <b style={{ color: C.rd }}>Tampered</b> = they diverged after execution. Executed contracts are also <b>locked</b> — material terms can't be edited without a formal amendment.
      </div>

      {drill && <IntegrityDrillIn contractId={drill} canAmend={canAmend} onClose={() => setDrill(null)} onOpenContract={onOpenContract} onAmended={load} />}
    </div>
  );
}
