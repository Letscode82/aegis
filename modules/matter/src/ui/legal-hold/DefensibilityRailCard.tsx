/**
 * DefensibilityRailCard — compact scorecard summary in the right
 * rail, with a "Show breakdown" modal and an "Export JSON" button
 * that triggers the existing /api/matter/[id]/holds/[holdId]/export.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import { DefensibilityBadge, defensibilityColor } from "./badges";
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
}

export const DefensibilityRailCard: React.FC<DefensibilityRailCardProps> = ({
  matterId,
  holdId,
}) => {
  const [score, setScore] = useState<HoldDefensibilityScoreDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/scorecard`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setScore)
      .catch((e) => setError(String(e)));
  }, [matterId, holdId]);

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
      {error && (
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M, marginTop: 6 }}>
          {error}
        </div>
      )}
      {!score && !error && (
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
  value: number;
  gap: string | null;
}> = ({ label, value, gap }) => {
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
}> = ({ score, onClose }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Defensibility breakdown"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          padding: 18,
          minWidth: 540,
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: F,
          color: C.t1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH icon="📊" title="Defensibility breakdown" sub={`Computed ${new Date(score.computedAt).toISOString().slice(0, 16).replace("T", " ")}`} />
          <DefensibilityBadge score={score.score} />
        </div>
        <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
          {Object.entries(score.components).map(([key, c]) => (
            <div key={key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10.5,
                  color: C.t2,
                  fontFamily: F,
                }}
              >
                <span>
                  {COMPONENT_LABELS[key] ?? key}{" "}
                  <span style={{ color: C.t4, fontSize: 9 }}>· weight {c.weight}</span>
                </span>
                <span style={{ fontFamily: M, color: C.t1 }}>{Math.round(c.value * 100)}%</span>
              </div>
              <div style={{ height: 5, background: C.br, borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
                <div
                  style={{
                    width: `${Math.round(c.value * 100)}%`,
                    height: "100%",
                    background: defensibilityColor(Math.round(c.value * 100)),
                  }}
                />
              </div>
              {c.gap && (
                <div style={{ fontSize: 9.5, color: C.am, fontFamily: M, marginTop: 2 }}>
                  {c.gap}
                </div>
              )}
            </div>
          ))}
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.br}`,
              color: C.t1,
              padding: "6px 14px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: F,
              fontSize: 11,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
