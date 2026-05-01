/**
 * LegalHoldPanel — placeholder card.
 *
 * Sub-PR 4b implements the full Legal Hold workflow (issue, attest,
 * release, custodian view). For 4a we render the existing seeded
 * holds with a "coming in 4b" annotation so the matter detail UI
 * already has the slot wired.
 */
import React, { useEffect, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";

interface LegalHoldDTO {
  id: string;
  scope: string;
  status: "DRAFT" | "ISSUED" | "RELEASED";
  issuedAt: string | null;
  releasedAt: string | null;
  reason: string | null;
}

const STATUS_COLOR: Record<LegalHoldDTO["status"], string> = {
  DRAFT: C.t3,
  ISSUED: C.am,
  RELEASED: C.gn,
};

export interface LegalHoldPanelProps {
  matterId: string;
  endpoint?: string;
}

export const LegalHoldPanel: React.FC<LegalHoldPanelProps> = ({
  matterId,
  endpoint = "/api/matter",
}) => {
  const [holds, setHolds] = useState<LegalHoldDTO[] | null>(null);

  useEffect(() => {
    fetch(`${endpoint}/${matterId}/legal-holds`)
      .then((r) => r.json())
      .then(setHolds)
      .catch(() => setHolds([]));
  }, [endpoint, matterId]);

  return (
    <Card>
      <SH
        icon="🛑"
        title="Legal hold"
        sub="Workflow coming in 4b — schema and read-side wired today"
      />
      {!holds && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>Loading…</div>
      )}
      {holds && holds.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11.5, fontFamily: F }}>
          No legal holds on this matter.
        </div>
      )}
      {holds && holds.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {holds.map((h) => (
            <div
              key={h.id}
              style={{
                border: `1px solid ${STATUS_COLOR[h.status]}33`,
                borderRadius: 6,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontFamily: M, fontSize: 11, color: C.t1 }}>
                  Hold {h.id}
                </span>
                <Pill t={h.status} c={STATUS_COLOR[h.status]} />
              </div>
              <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }}>
                {h.scope}
              </div>
              {h.reason && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.t3,
                    fontStyle: "italic",
                    marginTop: 6,
                  }}
                >
                  {h.reason}
                </div>
              )}
              <div
                style={{
                  fontSize: 10,
                  color: C.t4,
                  fontFamily: M,
                  marginTop: 6,
                }}
              >
                {h.issuedAt
                  ? `Issued ${new Date(h.issuedAt).toISOString().slice(0, 10)}`
                  : "Not yet issued"}
                {h.releasedAt
                  ? ` · Released ${new Date(h.releasedAt).toISOString().slice(0, 10)}`
                  : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: C.cdH,
          borderRadius: 4,
          fontSize: 10.5,
          color: C.t3,
          fontFamily: M,
          lineHeight: 1.5,
        }}
      >
        Sub-PR 4b will add: hold issuance workflow, custodian-side notice & attestation,
        preservation-order tracking, release flow, and the full audit trail.
      </div>
    </Card>
  );
};
