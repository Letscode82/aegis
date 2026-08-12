import { useState, useEffect, useCallback } from "react";
import { C, F, M } from "@aegis/ui";

// ── E-signature requests (CTR-15) ────────────────────────────────────
//
// Issue a native e-signature request (tokenised signing link) to a signer and
// track status. The raw link is shown ONCE at creation (the token isn't stored
// raw — same security model as the review link); copy it then. Reads/writes
// /api/contracts/[id]/signature-requests. On completion the contract
// auto-executes (both sides signed + APPROVED).

const STATUS = {
  SENT:     { label: "Sent",     c: C.bl },
  VIEWED:   { label: "Viewed",   c: C.tl },
  SIGNED:   { label: "Signed",   c: C.gn },
  DECLINED: { label: "Declined", c: C.rd },
  REVOKED:  { label: "Revoked",  c: C.t4 },
  EXPIRED:  { label: "Expired",  c: C.t4 },
};
const fmt = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

export function ESignaturePanel({ contractId, canManage }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [party, setParty] = useState("COUNTERPARTY");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [newLink, setNewLink] = useState(null);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/signature-requests`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setRequests(d.requests || []))
      .catch((e) => setError(String(e)));
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  const request = async () => {
    if (!signerName.trim()) { setError("Enter the signer's name."); return; }
    setBusy(true); setError(null); setNewLink(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/signature-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party, signerName: signerName.trim(), signerEmail: signerEmail.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNewLink(`${window.location.origin}${d.signingPath}`);
      setSignerName(""); setSignerEmail(""); load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const revoke = async (req) => {
    setBusy(true);
    try {
      await fetch(`/api/contracts/${contractId}/signature-requests/${req.id}/revoke`, { method: "POST" });
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  if (error && !requests) return null;

  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>E-signature requests</div>

      {(requests || []).length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {requests.map((r) => {
            const s = STATUS[r.status] || STATUS.SENT;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11, borderBottom: `1px solid ${C.br}22` }}>
                <span style={{ fontSize: 8, fontFamily: M, color: C.t4, border: `1px solid ${C.br}`, borderRadius: 3, padding: "0 4px" }}>{r.party}</span>
                <span style={{ color: C.t1 }}>{r.signerName}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: M, color: s.c, textTransform: "uppercase", letterSpacing: .4 }}>{s.label}{r.signedAt ? ` · ${fmt(r.signedAt)}` : ""}</span>
                {canManage && (r.status === "SENT" || r.status === "VIEWED") && <span onClick={() => revoke(r)} style={{ fontSize: 9, fontFamily: M, color: C.rd, cursor: "pointer", textTransform: "uppercase" }}>revoke</span>}
              </div>
            );
          })}
        </div>
      )}

      {newLink && (
        <div style={{ padding: "8px 10px", marginBottom: 10, background: C.gnG || C.bg, border: `1px solid ${C.gn}55`, borderRadius: 5 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.gn, letterSpacing: .5, textTransform: "uppercase", marginBottom: 4 }}>Signing link created — copy it now (shown once)</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input readOnly value={newLink} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t2, fontFamily: M, fontSize: 10, padding: "5px 7px" }} />
            <button onClick={() => { navigator.clipboard?.writeText(newLink); }} style={{ padding: "5px 10px", background: C.gn, color: C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", cursor: "pointer" }}>Copy</button>
          </div>
          <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, marginTop: 4 }}>Email delivery is stubbed — send this link to the signer.</div>
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={party} onChange={(e) => setParty(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: M, fontSize: 10.5, padding: "6px 7px" }}>
            <option value="COUNTERPARTY">Counterparty</option>
            <option value="INTERNAL">Internal</option>
          </select>
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Signer name" style={{ flex: 1, minWidth: 120, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }} />
          <input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="Email (optional)" style={{ flex: 1, minWidth: 120, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px" }} />
          <button onClick={request} disabled={busy} style={{ padding: "6px 12px", background: C.bl, color: "#fff", border: "none", borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", opacity: busy ? .6 : 1 }}>{busy ? "…" : "✍ Request signature"}</button>
        </div>
      )}
      {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 10, marginTop: 6 }}>⚠ {error}</div>}
    </div>
  );
}
