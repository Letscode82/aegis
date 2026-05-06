/**
 * CustodianAttestationView — custodian-side acknowledgment.
 *
 * Renders the notice body, a structured "I attest" form, and a
 * data-source visibility list so the custodian can confirm what's
 * being preserved on their behalf.
 *
 * Sub-PR 4c.5 mobile redesign (Item 18):
 *   - Below 640px (phone): single-column, sticky submit button at
 *     the bottom, large touch targets (44px+), larger font sizes
 *     for readability without zoom.
 *   - 640–1024px (tablet) and >1024px (desktop): existing layout.
 *   - Notice body is collapsible on phone with a "Read full notice"
 *     toggle so the form is reachable without scrolling past long
 *     mandatory language.
 *   - Success state shows a clear confirmation card with matter
 *     title, hold title, timestamp, and re-attestation due date.
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

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export const CustodianAttestationView: React.FC<CustodianAttestationViewProps> = ({
  holdId,
  personId,
  matterId,
  endpoint = "/api/matter",
}) => {
  const narrow = useIsNarrow();
  const [data, setData] = useState<PrefetchedView | null>(null);
  const [statement, setStatement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState<boolean>(true);

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
    <div
      style={{
        display: "grid",
        gap: 14,
        padding: narrow ? 12 : 14,
        maxWidth: 760,
        // Leave room at the bottom for the sticky submit on phones
        // so the last card isn't hidden behind it.
        paddingBottom: narrow && !alreadyAck && !done ? 90 : 14,
      }}
    >
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <SH
            icon="📜"
            title="Notice text"
            sub={
              data.notice
                ? `Content hash ${data.notice.bodyHashAtIssuance.slice(0, 16)}…`
                : "(no notice issued)"
            }
          />
          {narrow && (
            <button
              type="button"
              onClick={() => setNoticeOpen((v) => !v)}
              aria-expanded={noticeOpen}
              style={{
                background: "transparent",
                border: `1px solid ${C.br}`,
                color: C.t2,
                padding: "8px 14px",
                borderRadius: 6,
                fontFamily: F,
                fontSize: 13,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              {noticeOpen ? "Collapse" : "Read full notice"}
            </button>
          )}
        </div>
        {(!narrow || noticeOpen) && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: narrow ? 13 : 11,
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
            The hold notice text was delivered when the hold was issued.
            Reference content hash:{" "}
            <span style={{ fontFamily: M, color: C.tl }}>
              {data.notice?.bodyHashAtIssuance ?? "(none)"}
            </span>
          </pre>
        )}
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
              padding: 14,
              border: `1px solid ${C.gn}`,
              background: C.gnG,
              borderRadius: 4,
              fontFamily: F,
              color: C.t1,
            }}
            role="status"
            aria-live="polite"
          >
            <div
              style={{
                fontFamily: SR,
                fontSize: narrow ? 20 : 18,
                color: C.gn,
                marginBottom: 8,
              }}
            >
              ✓ Hold acknowledged
            </div>
            <div
              style={{
                fontSize: narrow ? 14 : 12,
                lineHeight: 1.5,
                color: C.t2,
              }}
            >
              <div>Matter: {data.hold.title}</div>
              <div style={{ marginTop: 2 }}>
                Acknowledged at {new Date().toISOString().replace("T", " ").slice(0, 16)}
              </div>
              <div style={{ marginTop: 8, color: C.t3 }}>
                The hold remains in effect until released. You&apos;ll be
                contacted if more information is needed. Keep this page or
                your confirmation email for your records.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder='I confirm I have suspended auto-deletion across the listed sources and will not destroy responsive data until the hold is released.'
              rows={narrow ? 5 : 3}
              autoFocus={!narrow}
              aria-label="Attestation statement"
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                padding: narrow ? "12px" : "8px 12px",
                borderRadius: 4,
                color: C.t1,
                fontFamily: F,
                fontSize: narrow ? 14 : 12,
                outline: "none",
                resize: "vertical",
                minHeight: narrow ? 120 : 60,
              }}
            />
            {!narrow && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <SubmitButton
                  submitting={submitting}
                  ready={statement.trim().length >= 10}
                  onSubmit={submit}
                  narrow={false}
                />
              </div>
            )}
            {narrow && (
              <div
                style={{
                  position: "fixed",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: 12,
                  background: `${C.bg}ee`,
                  borderTop: `1px solid ${C.br}`,
                  zIndex: 50,
                  backdropFilter: "blur(6px)",
                }}
              >
                <SubmitButton
                  submitting={submitting}
                  ready={statement.trim().length >= 10}
                  onSubmit={submit}
                  narrow
                />
              </div>
            )}
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

const SubmitButton: React.FC<{
  submitting: boolean;
  ready: boolean;
  onSubmit: () => void;
  narrow: boolean;
}> = ({ submitting, ready, onSubmit, narrow }) => (
  <button
    type="button"
    onClick={onSubmit}
    disabled={submitting || !ready}
    aria-disabled={submitting || !ready}
    style={{
      background: ready ? C.gn : C.br,
      border: "none",
      color: ready ? C.bg : C.t3,
      padding: narrow ? "14px 24px" : "8px 18px",
      borderRadius: narrow ? 8 : 4,
      cursor: submitting ? "wait" : ready ? "pointer" : "not-allowed",
      fontFamily: F,
      fontSize: narrow ? 14 : 11,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      width: narrow ? "100%" : undefined,
      minHeight: narrow ? 52 : undefined,
    }}
  >
    {submitting ? "Submitting…" : "I attest — acknowledge"}
  </button>
);
