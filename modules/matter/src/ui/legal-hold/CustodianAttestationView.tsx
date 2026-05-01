/**
 * CustodianAttestationView — custodian-side acknowledgment.
 *
 * Renders the notice body, a structured "I attest" form, and a
 * data-source visibility list so the custodian can confirm what's
 * being preserved on their behalf.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M, SR } from "@aegis/ui";
import { JurisdictionPills, StatusPill } from "./badges";
import type {
  HoldCustodianDTO,
  HoldDetailDTO,
  HoldNoticeIssuanceDTO,
} from "./types";

export interface CustodianAttestationViewProps {
  holdId: string;
  personId: string;
  matterId: string;
  endpoint?: string;
}

interface PrefetchedView {
  hold: HoldDetailDTO;
  notice: HoldNoticeIssuanceDTO | null;
  custodian: HoldCustodianDTO | null;
}

export const CustodianAttestationView: React.FC<CustodianAttestationViewProps> = ({
  holdId,
  personId,
  matterId,
  endpoint = "/api/matter",
}) => {
  const [data, setData] = useState<PrefetchedView | null>(null);
  const [statement, setStatement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `${endpoint}/${matterId}/holds/${holdId}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(baseUrl).then((r) => r.json()),
      fetch(`${baseUrl}/notices`).then((r) => r.json()),
      fetch(`${baseUrl}/custodians`).then((r) => r.json()),
    ])
      .then(([hold, notices, custodians]) => {
        if (!alive) return;
        const custodian =
          (custodians as HoldCustodianDTO[]).find((c) => c.personId === personId) ?? null;
        const notice = (notices as HoldNoticeIssuanceDTO[])[0] ?? null;
        setData({ hold, notice, custodian });
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [baseUrl, personId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${baseUrl}/custodians/${personId}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attestationStatement: statement.trim() }),
      });
      if (!r.ok && r.status !== 200) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (error)
    return (
      <Card>
        <div style={{ color: C.rd, fontSize: 12, fontFamily: M }}>{error}</div>
      </Card>
    );
  if (!data)
    return (
      <Card>
        <div style={{ color: C.t3, fontSize: 12, fontFamily: M }}>Loading…</div>
      </Card>
    );

  const alreadyAck = !!data.custodian?.acknowledgedAt;

  return (
    <div style={{ display: "grid", gap: 14, padding: 14, maxWidth: 760 }}>
      <Card>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
            {data.hold.holdNumber ?? "(draft)"}
          </span>
          <StatusPill status={data.hold.status} />
          <JurisdictionPills codes={data.hold.jurisdictions} />
        </div>
        <div style={{ fontFamily: SR, fontSize: 22, color: C.t1, lineHeight: 1.2 }}>
          {data.hold.title}
        </div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 6 }}>
          {data.hold.scopeDescription}
        </div>
      </Card>

      <Card>
        <SH icon="📜" title="Notice text" sub={data.notice ? `Content hash ${data.notice.bodyHashAtIssuance.slice(0, 16)}…` : "(no notice issued)"} />
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 11,
            fontFamily: F,
            color: C.t1,
            lineHeight: 1.5,
            background: C.s1,
            padding: 12,
            border: `1px solid ${C.br}`,
            borderRadius: 4,
            marginTop: 6,
          }}
        >
          {/* Notice body is fetched as part of the issuance template;
              this attestation view shows the most recent issuance. */}
          The hold notice text was delivered when the hold was issued.
          Reference content hash:{" "}
          <span style={{ fontFamily: M, color: C.tl }}>
            {data.notice?.bodyHashAtIssuance ?? "(none)"}
          </span>
        </pre>
      </Card>

      <Card>
        <SH icon="✓" title="Acknowledge receipt" />
        {alreadyAck ? (
          <div
            style={{
              padding: 10,
              border: `1px solid ${C.gn}`,
              background: C.gnG,
              borderRadius: 4,
              fontSize: 11.5,
              color: C.gn,
              fontFamily: M,
            }}
          >
            ✓ Acknowledged{" "}
            {data.custodian?.acknowledgedAt &&
              new Date(data.custodian.acknowledgedAt).toISOString().slice(0, 10)}
            . Next re-attestation due{" "}
            {data.custodian?.nextReAttestationDueAt &&
              new Date(data.custodian.nextReAttestationDueAt).toISOString().slice(0, 10)}
            .
          </div>
        ) : done ? (
          <div
            style={{
              padding: 10,
              border: `1px solid ${C.gn}`,
              background: C.gnG,
              borderRadius: 4,
              fontSize: 11.5,
              color: C.gn,
              fontFamily: M,
            }}
          >
            ✓ Acknowledgment recorded. The hold remains in effect until released.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder='I confirm I have suspended auto-deletion across the listed sources and will not destroy responsive data until the hold is released.'
              rows={3}
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                padding: "8px 12px",
                borderRadius: 4,
                color: C.t1,
                fontFamily: F,
                fontSize: 12,
                outline: "none",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || statement.trim().length < 10}
                style={{
                  background: statement.trim().length >= 10 ? C.gn : C.br,
                  border: "none",
                  color: C.bg,
                  padding: "8px 18px",
                  borderRadius: 4,
                  cursor: submitting ? "wait" : "pointer",
                  fontFamily: F,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {submitting ? "Submitting…" : "I attest — acknowledge"}
              </button>
            </div>
          </div>
        )}
      </Card>

      {data.custodian?.dataSources && data.custodian.dataSources.length > 0 && (
        <Card>
          <SH icon="📦" title="Your data sources under preservation" />
          <div style={{ display: "grid", gap: 4 }}>
            {data.custodian.dataSources.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 130px",
                  fontSize: 11,
                  fontFamily: F,
                  padding: "4px 6px",
                  borderBottom: `1px solid ${C.br}22`,
                }}
              >
                <span>{d.displayLabel}</span>
                <span style={{ fontFamily: M, color: C.t3, fontSize: 10 }}>{d.type}</span>
                <span style={{ fontFamily: M, color: d.preservationConfirmedAt ? C.gn : C.am, fontSize: 10 }}>
                  {d.preservationConfirmedAt ? "✓ confirmed" : "applied"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
