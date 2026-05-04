/**
 * CustodianRow — single custodian row in the workspace.
 *
 * Collapsed: name + status + ack + source counts + chevron.
 * Expanded: data sources sub-list with per-source preservation
 * status and confirm-preservation action; acknowledgment metadata
 * (timestamp + IP + statement); inline actions (re-attest, release,
 * mark-confirmed bulk).
 *
 * Keyboard: row is focusable, Enter / Space toggles. Action buttons
 * are tabbable inside the expanded body.
 */
import React, { useState } from "react";
import { Pill, C, F, M } from "@aegis/ui";
import type { HoldCustodianDTO, HoldDataSourceDTO } from "./types";

type RowStatus =
  | "pending"
  | "acknowledged"
  | "overdue"
  | "released"
  | "departed";

function deriveStatus(c: HoldCustodianDTO): RowStatus {
  if (c.releasedAt) return "released";
  if (c.departureRecordedAt) return "departed";
  if (
    c.nextReAttestationDueAt &&
    new Date(c.nextReAttestationDueAt).getTime() < Date.now()
  ) {
    return "overdue";
  }
  if (c.acknowledgedAt) return "acknowledged";
  return "pending";
}

const STATUS_COLORS: Record<RowStatus, string> = {
  pending: C.am,
  acknowledged: C.gn,
  overdue: C.rd,
  released: C.t4,
  departed: C.rd,
};

function lastSignal(c: HoldCustodianDTO): string {
  const ts =
    c.releasedAt ??
    c.lastReAttestedAt ??
    c.acknowledgedAt ??
    c.departureRecordedAt;
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

export interface CustodianRowProps {
  custodian: HoldCustodianDTO;
  /** Total preserved-source count for the row's headline. */
  preservedSourceCount: number;
  /** Inline actions — only rendered when the actor has matter:legal_hold:issue. */
  canMutate: boolean;
  onReAttest: () => void;
  onRelease: () => void;
  onConfirmPreservation: (dataSourceId: string) => void;
}

export const CustodianRow: React.FC<CustodianRowProps> = ({
  custodian,
  preservedSourceCount,
  canMutate,
  onReAttest,
  onRelease,
  onConfirmPreservation,
}) => {
  const [open, setOpen] = useState(false);
  const status = deriveStatus(custodian);
  const sourceCount = custodian.dataSources.length;

  return (
    <div
      style={{
        borderBottom: `1px solid ${C.br}33`,
        background: open ? C.cdH : "transparent",
        transition: "background .12s",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        aria-label={`${custodian.personName}, ${status}, ${sourceCount} data source${sourceCount === 1 ? "" : "s"}, ${preservedSourceCount} preserved`}
        style={{
          display: "grid",
          gridTemplateColumns: "20px 1.6fr 130px 110px 130px 90px",
          gap: 10,
          padding: "9px 10px",
          alignItems: "center",
          fontFamily: F,
          color: C.t1,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <span
          style={{
            color: C.t3,
            fontSize: 11,
            fontFamily: M,
            transform: open ? "rotate(90deg)" : "rotate(0)",
            transition: "transform .15s",
            display: "inline-block",
          }}
          aria-hidden="true"
        >
          ▶
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t1 }}>
            {custodian.personName}
          </div>
          <div style={{ fontSize: 10, color: C.t3, fontFamily: M }}>
            {custodian.personEmail ?? ""}
          </div>
        </div>
        <Pill
          t={status === "departed" ? "departed" : status}
          c={STATUS_COLORS[status]}
        />
        <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
          {custodian.acknowledgedAt
            ? `Acked ${new Date(custodian.acknowledgedAt).toISOString().slice(0, 10)}`
            : "Pending"}
        </span>
        <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
          {sourceCount} src · {preservedSourceCount} preserved
        </span>
        <span style={{ fontFamily: M, fontSize: 10, color: C.t4, textAlign: "right" }}>
          {lastSignal(custodian)}
        </span>
      </div>

      {open && (
        <div
          style={{
            padding: "8px 14px 14px 36px",
            borderTop: `1px solid ${C.br}22`,
            display: "grid",
            gap: 8,
          }}
        >
          {custodian.acknowledgmentMetadata ? (
            <AcknowledgmentBlock metadata={custodian.acknowledgmentMetadata} />
          ) : null}
          <SourceList
            sources={custodian.dataSources}
            canMutate={canMutate}
            onConfirmPreservation={onConfirmPreservation}
          />
          {canMutate && status !== "released" && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {status !== "departed" && (
                <button
                  type="button"
                  onClick={onReAttest}
                  style={miniBtn(C.bl)}
                >
                  Re-attest now
                </button>
              )}
              <button
                type="button"
                onClick={onRelease}
                style={miniBtn(C.rd)}
              >
                Release this custodian
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AckMeta {
  ip?: string | null;
  userAgent?: string | null;
  attestationStatement?: string | null;
}

const AcknowledgmentBlock: React.FC<{ metadata: unknown }> = ({ metadata }) => {
  const m = (metadata ?? {}) as AckMeta;
  return (
    <div
      style={{
        background: C.s1,
        border: `1px solid ${C.gn}33`,
        borderLeft: `3px solid ${C.gn}`,
        padding: 8,
        borderRadius: 4,
        fontFamily: F,
        fontSize: 10.5,
        color: C.t2,
      }}
    >
      <div style={{ color: C.gn, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
        Acknowledged
      </div>
      {m.attestationStatement && (
        <div style={{ marginBottom: 4, color: C.t1, fontStyle: "italic" }}>
          “{m.attestationStatement}”
        </div>
      )}
      <div style={{ display: "flex", gap: 12, fontFamily: M, fontSize: 9.5, color: C.t4 }}>
        {m.ip && <span>IP {m.ip}</span>}
        {m.userAgent && (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
            UA {m.userAgent}
          </span>
        )}
      </div>
    </div>
  );
};

const TYPE_ICON: Record<string, string> = {
  EMAIL_MAILBOX: "✉",
  ARCHIVED_MAILBOX: "📦",
  DEPARTED_USER_MAILBOX: "👤",
  ONEDRIVE: "💾",
  SHAREPOINT_SITE: "🗂",
  TEAMS_CHANNEL: "#",
  TEAMS_DM: "💬",
  TEAMS_PRIVATE_CHANNEL: "🔒",
  SLACK_CHANNEL: "#",
  SLACK_DM: "💬",
  GOOGLE_DRIVE: "💾",
  GOOGLE_CHAT: "💬",
  EPHEMERAL_CHAT_AUTO_DELETE: "⏱",
  LOCAL_DEVICE: "💻",
  PHYSICAL_FILES: "📁",
  THIRD_PARTY_SAAS: "🔗",
  OTHER: "?",
};

const SourceList: React.FC<{
  sources: HoldDataSourceDTO[];
  canMutate: boolean;
  onConfirmPreservation: (id: string) => void;
}> = ({ sources, canMutate, onConfirmPreservation }) => {
  if (sources.length === 0) {
    return (
      <div style={{ color: C.t4, fontSize: 10.5, fontFamily: M }}>
        No data sources mapped to this custodian.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {sources.map((d) => {
        const confirmed = !!d.preservationConfirmedAt;
        const conflict = d.retentionPolicyConflict;
        return (
          <div
            key={d.id}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1.4fr 200px 130px 110px",
              gap: 8,
              alignItems: "center",
              padding: "5px 6px",
              fontSize: 10.5,
              fontFamily: F,
              borderBottom: `1px solid ${C.br}22`,
            }}
          >
            <span style={{ fontFamily: M, color: C.t3 }} aria-hidden="true">
              {TYPE_ICON[d.type] ?? "•"}
            </span>
            <span style={{ color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.displayLabel}
            </span>
            <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
              {d.type} · {d.preservationAction}
            </span>
            <span style={{ fontFamily: M, fontSize: 9.5, color: confirmed ? C.gn : C.am }}>
              {confirmed ? "✓ confirmed" : "preservation pending"}
              {conflict && " · ⚠ conflict"}
            </span>
            <span style={{ textAlign: "right" }}>
              {!confirmed && canMutate && (
                <button
                  type="button"
                  onClick={() => onConfirmPreservation(d.id)}
                  style={miniBtn(C.gn)}
                  aria-label={`Mark preservation confirmed for ${d.displayLabel}`}
                >
                  Mark confirmed
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

function miniBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}55`,
    color,
    padding: "3px 9px",
    borderRadius: 4,
    fontSize: 10,
    fontFamily: F,
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: 0.3,
  };
}
