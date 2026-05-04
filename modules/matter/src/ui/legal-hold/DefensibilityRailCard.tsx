/**
 * DefensibilityRailCard — compact scorecard summary in the right
 * rail, with a "Show breakdown" modal and an "Export JSON" button
 * that triggers the existing /api/matter/[id]/holds/[holdId]/export.
 *
 * Score state lives in the parent HoldDetailPage so the rail card
 * and the header strip can never disagree about the current score —
 * any custodian / data-source / acknowledgment mutation that bumps
 * the parent's reload key refreshes both surfaces in lockstep.
 *
 * The breakdown modal renders via a React portal to document.body
 * so an ancestor Card's persisted `transform: translateY(0)` (from
 * Aurora's `fu` mount animation) doesn't trap `position: fixed`
 * inside the rail's narrow column.
 */
import React, { useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import { DefensibilityBadge, defensibilityColor } from "./badges";
import { ModalShell } from "./ModalShell";
import type { HoldDefensibilityScoreDTO } from "./types";

const COMPONENT_LABELS: Record<string, string> = {
  custodianAcknowledgmentRate: "Acknowledgment",
  reAttestationCurrency: "Re-attestation",
  dataSourcePreservationCoverage: "Preservation coverage",
  itPreservationConfirmationRate: "IT confirmation",
  noticeTemplateIntegrity: "Template integrity",
  auditChainIntegrity: "Audit chain",
};

export interface DefensibilityRailCardProps {
  matterId: string;
  holdId: string;
  /** Lifted from HoldDetailPage so header + rail show the same value. */
  score: HoldDefensibilityScoreDTO | null;
}

export const DefensibilityRailCard: React.FC<DefensibilityRailCardProps> = ({
  matterId,
  holdId,
  score,
}) => {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <SH icon="📊" title="Defensibility" />
        {score && <DefensibilityBadge score={score.score} />}
      </div>
      {!score && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          Loading…
        </div>
      )}
      {score && (
        <div style={{ display: "grid", gap: 5, marginTop: 12 }}>
          {Object.entries(score.components).map(([key, c]) => (
            <MiniBar
              key={key}
              label={COMPONENT_LABELS[key] ?? key}
              value={c.value}
              gap={c.gap}
              notApplicableReason={c.notApplicableReason ?? null}
            />
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          disabled={!score}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: score ? C.t1 : C.t4,
            padding: "5px 10px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            cursor: score ? "pointer" : "default",
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          Show breakdown
        </button>
        <a
          href={`/api/matter/${matterId}/holds/${holdId}/export`}
          style={{
            background: C.bl,
            border: "none",
            color: C.bg,
            padding: "5px 10px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            fontWeight: 700,
            textDecoration: "none",
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          Export JSON
        </a>
      </div>
      {breakdownOpen && score && (
        <DefensibilityBreakdownModal
          score={score}
          onClose={() => setBreakdownOpen(false)}
        />
      )}
    </Card>
  );
};

const MiniBar: React.FC<{
  label: string;
  value: number | null;
  gap: string | null;
  notApplicableReason: string | null;
}> = ({ label, value, gap, notApplicableReason }) => {
  if (value === null) {
    return (
      <div title={notApplicableReason ?? "Not yet applicable"}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 9.5,
            fontFamily: F,
            color: C.t3,
            marginBottom: 2,
          }}
        >
          <span>{label}</span>
          <span
            style={{
              fontFamily: M,
              color: C.t4,
              fontSize: 9.5,
              letterSpacing: 0.5,
            }}
          >
            —
          </span>
        </div>
        <div
          style={{
            height: 4,
            background: C.br,
            borderRadius: 2,
            overflow: "hidden",
            opacity: 0.4,
          }}
        />
      </div>
    );
  }
  const pct = Math.round(value * 100);
  return (
    <div title={gap ?? `${pct}%`}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9.5,
          fontFamily: F,
          color: C.t2,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: M, color: C.t1, fontSize: 9.5 }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 4,
          background: C.br,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: defensibilityColor(pct),
            transition: "width .25s",
          }}
        />
      </div>
    </div>
  );
};

const DefensibilityBreakdownModal: React.FC<{
  score: HoldDefensibilityScoreDTO;
  onClose: () => void;
}> = ({ score, onClose }) => (
  <ModalShell
    onClose={onClose}
    ariaLabel="Defensibility breakdown"
    title="Defensibility breakdown"
    icon="📊"
    sub={`Computed ${new Date(score.computedAt).toISOString().slice(0, 16).replace("T", " ")}`}
    headerRight={<DefensibilityBadge score={score.score} />}
  >
    <div style={{ display: "grid", gap: 6 }}>
      {Object.entries(score.components).map(([key, c]) => {
        const isNa = c.value === null;
        const pct = isNa ? 0 : Math.round((c.value as number) * 100);
        return (
          <div
            key={key}
            title={isNa ? c.notApplicableReason ?? "Not yet applicable" : undefined}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10.5,
                color: isNa ? C.t3 : C.t2,
                fontFamily: F,
              }}
            >
              <span>
                {COMPONENT_LABELS[key] ?? key}{" "}
                <span style={{ color: C.t4, fontSize: 9 }}>· weight {c.weight}</span>
              </span>
              <span
                style={{
                  fontFamily: M,
                  color: isNa ? C.t4 : C.t1,
                  letterSpacing: isNa ? 0.5 : 0,
                }}
              >
                {isNa ? "—" : `${pct}%`}
              </span>
            </div>
            <div
              style={{
                height: 5,
                background: C.br,
                borderRadius: 2,
                overflow: "hidden",
                marginTop: 3,
                opacity: isNa ? 0.4 : 1,
              }}
            >
              {!isNa && (
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: defensibilityColor(pct),
                  }}
                />
              )}
            </div>
            {isNa && c.notApplicableReason && (
              <div
                style={{
                  fontSize: 9.5,
                  color: C.t4,
                  fontFamily: M,
                  marginTop: 2,
                  fontStyle: "italic",
                }}
              >
                {c.notApplicableReason}
              </div>
            )}
            {!isNa && c.gap && (
              <div style={{ fontSize: 9.5, color: C.am, fontFamily: M, marginTop: 2 }}>
                {c.gap}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {score.gaps.length > 0 && (
      <div style={{ marginTop: 18 }}>
        <SH icon="⚠" title="Gaps" sub={`${score.gaps.length} issue${score.gaps.length === 1 ? "" : "s"}`} />
        <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
          {score.gaps.map((g) => (
            <div
              key={g.key + g.message}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 50px",
                fontSize: 11,
                fontFamily: F,
                padding: "4px 6px",
                borderBottom: `1px solid ${C.br}22`,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: M,
                  fontSize: 9.5,
                  color:
                    g.severity === "high"
                      ? C.rd
                      : g.severity === "medium"
                        ? C.am
                        : C.t3,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {g.severity}
              </span>
              <span style={{ color: C.t1 }}>{g.message}</span>
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3, textAlign: "right" }}>
                {g.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </ModalShell>
);
