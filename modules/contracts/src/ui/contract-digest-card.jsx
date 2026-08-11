import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Proactive digest card (Phase 3) ──────────────────────────────────
//
// A "this week" summary that turns the pull-only surfaces (renewals,
// obligations, integrity) into one glanceable headline: overdue/due
// obligations, renewal notice windows closing, expiring contracts, tampered
// contracts. Reads GET /api/contracts/digest. Collapsed to the headline by
// default; expand for the itemized sections. (The admin digest job records a
// chain-sealed row; real email delivery is a documented stub.)

const SECTIONS = [
  { key: "tampered", label: "Tampered", c: C.rd },
  { key: "obligationsOverdue", label: "Overdue obligations", c: C.rd },
  { key: "noticesClosing", label: "Renewal notices closing", c: C.am },
  { key: "obligationsDue", label: "Obligations due soon", c: C.am },
  { key: "expiringSoon", label: "Expiring soon", c: C.bl },
];

export function ContractDigestCard({ onOpenContract }) {
  const [digest, setDigest] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/contracts/digest")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && d.ok && setDigest(d.digest))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!digest) return null;
  const clear = digest.actionableTotal === 0;

  return (
    <div style={{ marginBottom: 16, background: C.cd, border: `1px solid ${clear ? C.br : C.am + "66"}`, borderLeft: `3px solid ${clear ? C.gn : C.am}`, borderRadius: 8, overflow: "hidden" }}>
      <div onClick={() => !clear && setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: clear ? "default" : "pointer" }}>
        <span style={{ fontSize: 15 }}>{clear ? "✅" : "📋"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>This week · contract digest</div>
          <div style={{ fontSize: 12.5, fontFamily: F, color: C.t1, marginTop: 2, lineHeight: 1.35 }}>{digest.summaryLine}</div>
        </div>
        {!clear && <span style={{ fontSize: 10, fontFamily: M, color: C.cy }}>{open ? "▾ Hide" : "▸ Details"}</span>}
      </div>
      {open && !clear && (
        <div style={{ padding: "4px 14px 14px", borderTop: `1px solid ${C.br}` }}>
          {SECTIONS.filter((s) => (digest.sections[s.key] || []).length > 0).map((s) => (
            <div key={s.key} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, fontFamily: M, color: s.c, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
                {s.label} · {digest.counts[s.key]}
              </div>
              {digest.sections[s.key].map((it, i) => (
                <div key={i} onClick={() => onOpenContract?.(it.contractId)} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.br}22`, cursor: "pointer" }}>
                  <span style={{ width: 3, alignSelf: "stretch", background: s.c, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                    <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 1 }}>{it.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
