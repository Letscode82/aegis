/**
 * CustodianPortalHome — list of every active hold the current
 * authenticated user is a custodian on (sub-PR 4c.5, Item 19).
 *
 * Mobile-first single-column layout. Each hold card shows the hold
 * title, matter title, scope summary, acknowledgment status pill,
 * and a primary action button (Acknowledge → opens the per-hold
 * ack page; Re-attest soon → same; Acknowledged ✓ → no action).
 *
 * Reads from /api/custodian/my-holds. Empty state explains there
 * are no holds and points the user to standard contact channels.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M, SR } from "@aegis/ui";

interface CustodianHoldRow {
  holdId: string;
  personId: string;
  matterId: string;
  matterTitle: string;
  holdTitle: string;
  holdNumber: string | null;
  scopeDescription: string;
  status: string;
  acknowledgedAt: string | null;
  lastReAttestedAt: string | null;
  nextReAttestationDueAt: string | null;
  releasedAt: string | null;
}

function statusOf(c: CustodianHoldRow): {
  label: string;
  color: string;
  cta: string;
} {
  if (c.releasedAt) {
    return { label: "Released", color: C.t4, cta: "View details" };
  }
  if (!c.acknowledgedAt) {
    return { label: "Pending", color: C.am, cta: "Acknowledge now" };
  }
  if (
    c.nextReAttestationDueAt &&
    new Date(c.nextReAttestationDueAt).getTime() < Date.now()
  ) {
    return { label: "Re-attestation overdue", color: C.rd, cta: "Re-attest" };
  }
  return { label: "Acknowledged", color: C.gn, cta: "View details" };
}

export const CustodianPortalHome: React.FC = () => {
  const [rows, setRows] = useState<CustodianHoldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/custodian/my-holds")
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: CustodianHoldRow[]) => alive && setRows(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 760,
        margin: "0 auto",
        display: "grid",
        gap: 14,
      }}
    >
      <header style={{ marginBottom: 4 }}>
        <h1
          style={{
            fontFamily: SR,
            fontSize: 22,
            color: C.t1,
            margin: 0,
            fontWeight: 400,
          }}
        >
          Your legal holds
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: C.t3,
            marginTop: 6,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          Every legal hold you&apos;ve been listed as a custodian on.
          Click any row to view the notice and acknowledge.
        </p>
      </header>

      {error && (
        <Card>
          <div style={{ color: C.rd, fontFamily: M, fontSize: 12 }}>{error}</div>
        </Card>
      )}

      {!rows && !error && (
        <Card>
          <div style={{ color: C.t3, fontFamily: M, fontSize: 12 }}>
            Loading…
          </div>
        </Card>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <SH icon="🛡" title="No active holds" />
          <p
            style={{
              fontFamily: F,
              fontSize: 12,
              color: C.t2,
              lineHeight: 1.5,
              marginTop: 6,
            }}
          >
            You&apos;re not currently listed as a custodian on any active legal
            hold. If you believe you should be, contact your legal-ops team.
          </p>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <HoldRow key={row.holdId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
};

const HoldRow: React.FC<{ row: CustodianHoldRow }> = ({ row }) => {
  const status = statusOf(row);
  const url = `/custodian/holds/${row.holdId}/acknowledge`;
  return (
    <a
      href={url}
      style={{
        display: "block",
        textDecoration: "none",
        color: C.t1,
      }}
    >
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontFamily: M,
                fontSize: 9.5,
                color: C.t3,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {row.holdNumber ?? "DRAFT"} · {row.matterTitle}
            </div>
            <div
              style={{
                fontFamily: SR,
                fontSize: 16,
                color: C.t1,
                marginBottom: 6,
              }}
            >
              {row.holdTitle}
            </div>
            <p
              style={{
                fontFamily: F,
                fontSize: 12,
                color: C.t2,
                margin: 0,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {row.scopeDescription}
            </p>
            {row.acknowledgedAt && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: M,
                  fontSize: 10.5,
                  color: C.t4,
                }}
              >
                Acknowledged {row.acknowledgedAt.slice(0, 10)}
                {row.nextReAttestationDueAt &&
                  ` · re-attest by ${row.nextReAttestationDueAt.slice(0, 10)}`}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: M,
                fontSize: 9.5,
                color: status.color,
                background: `${status.color}1f`,
                border: `1px solid ${status.color}55`,
                padding: "3px 10px",
                borderRadius: 12,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {status.label}
            </span>
            <span
              style={{
                fontFamily: F,
                fontSize: 11,
                color: C.bl,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              {status.cta} →
            </span>
          </div>
        </div>
      </Card>
    </a>
  );
};
