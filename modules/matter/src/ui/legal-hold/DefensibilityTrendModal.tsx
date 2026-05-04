/**
 * DefensibilityTrendModal — full trend chart with date-range
 * picker and per-component breakdown (sub-PR 4c.5, Item 15).
 *
 * Reads from /api/matter/[id]/holds/[holdId]/snapshots. Renders a
 * larger sparkline for the overall score, plus six smaller
 * sparklines for each scoring component. Date picker narrows the
 * series; default is "all data".
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, F, M, Sparkline } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

interface SnapshotDTO {
  id: string;
  computedAt: string;
  score: number;
  gapCount: number;
  components: Record<
    string,
    {
      value: number | null;
      weight: number;
      gap: string | null;
      notApplicableReason?: string | null;
    }
  >;
}

const COMPONENT_LABELS: Record<string, string> = {
  custodianAcknowledgmentRate: "Acknowledgment",
  reAttestationCurrency: "Re-attestation",
  dataSourcePreservationCoverage: "Preservation coverage",
  itPreservationConfirmationRate: "IT confirmation",
  noticeTemplateIntegrity: "Template integrity",
  auditChainIntegrity: "Audit chain",
};

const inputStyle: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.br}`,
  padding: "5px 8px",
  borderRadius: 4,
  color: C.t1,
  fontFamily: M,
  fontSize: 11,
  outline: "none",
};

export interface DefensibilityTrendModalProps {
  matterId: string;
  holdId: string;
  onClose: () => void;
}

export const DefensibilityTrendModal: React.FC<DefensibilityTrendModalProps> = ({
  matterId,
  holdId,
  onClose,
}) => {
  const [snapshots, setSnapshots] = useState<SnapshotDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    if (since) params.set("since", new Date(since).toISOString());
    if (until) params.set("until", new Date(`${until}T23:59:59Z`).toISOString());
    fetch(
      `/api/matter/${matterId}/holds/${holdId}/snapshots?${params.toString()}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((rows: SnapshotDTO[]) => alive && setSnapshots(rows))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId, since, until]);

  const overallPoints = useMemo(
    () =>
      (snapshots ?? []).map((s) => ({
        label: s.computedAt.slice(0, 10),
        value: s.score,
      })),
    [snapshots],
  );

  // Per-component series: pull `value` (0..1) for each component
  // from each snapshot, scale to 0..100. Null values become 0 here
  // for plot purposes — the rendered legend annotates gaps.
  const componentSeries = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return {};
    const keys = Object.keys(snapshots[0]?.components ?? {});
    const series: Record<string, { label: string; value: number }[]> = {};
    for (const key of keys) {
      series[key] = snapshots.map((s) => {
        const v = s.components[key]?.value ?? null;
        return {
          label: s.computedAt.slice(0, 10),
          value: v === null ? 0 : Math.round(v * 100),
        };
      });
    }
    return series;
  }, [snapshots]);

  const latest = snapshots && snapshots.length > 0
    ? snapshots[snapshots.length - 1]
    : null;

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Defensibility score trend"
      title="Defensibility trend"
      icon="📈"
      sub={
        snapshots
          ? `${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"} · latest ${latest?.score ?? "—"}/100`
          : "Loading…"
      }
      maxWidth={820}
    >
      {error && (
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: M,
            fontSize: 9.5,
            color: C.t3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Date range
        </span>
        <input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          style={inputStyle}
          aria-label="Trend start date"
        />
        <span style={{ color: C.t4, fontFamily: M, fontSize: 11 }}>to</span>
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          style={inputStyle}
          aria-label="Trend end date"
        />
        {(since || until) && (
          <button
            type="button"
            onClick={() => {
              setSince("");
              setUntil("");
            }}
            style={{
              background: "transparent",
              border: `1px solid ${C.br}`,
              color: C.t2,
              padding: "4px 10px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 10.5,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {snapshots && snapshots.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
          No snapshots in this date range. The recurring snapshot job
          captures one per active hold per UTC day.
        </div>
      )}

      {snapshots && snapshots.length > 0 && (
        <div style={{ display: "grid", gap: 18 }}>
          <Section label="Overall score (0–100)">
            <div
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                borderRadius: 4,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Sparkline
                points={overallPoints}
                width={520}
                height={80}
                ariaLabel="Defensibility score over time"
              />
              <div
                style={{
                  fontFamily: M,
                  fontSize: 22,
                  color: C.t1,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                {latest?.score ?? "—"}
                <span
                  style={{
                    fontFamily: M,
                    fontSize: 11,
                    color: C.t4,
                    marginLeft: 4,
                  }}
                >
                  /100
                </span>
              </div>
            </div>
          </Section>

          <Section label="Per-component trend">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {Object.entries(componentSeries).map(([key, series]) => (
                <ComponentTrendRow
                  key={key}
                  label={COMPONENT_LABELS[key] ?? key}
                  points={series}
                  latest={latest?.components[key]?.value ?? null}
                  notApplicableReason={
                    latest?.components[key]?.notApplicableReason ?? null
                  }
                />
              ))}
            </div>
          </Section>
        </div>
      )}
    </ModalShell>
  );
};

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <div
      style={{
        fontFamily: M,
        fontSize: 9.5,
        color: C.t3,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    {children}
  </div>
);

const ComponentTrendRow: React.FC<{
  label: string;
  points: { label: string; value: number }[];
  latest: number | null;
  notApplicableReason: string | null;
}> = ({ label, points, latest, notApplicableReason }) => {
  const isNa = latest === null;
  const pct = isNa ? null : Math.round(latest * 100);
  return (
    <div
      style={{
        background: C.s1,
        border: `1px solid ${C.br}`,
        borderRadius: 4,
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
        <span style={{ fontFamily: F, fontSize: 11, color: C.t1 }}>
          {label}
        </span>
        <span
          style={{
            fontFamily: M,
            fontSize: 11,
            color: isNa ? C.t4 : C.t1,
            fontWeight: 700,
          }}
        >
          {isNa ? "—" : `${pct}%`}
        </span>
      </div>
      <Sparkline
        points={points}
        width={240}
        height={36}
        ariaLabel={`${label} trend`}
      />
      {isNa && notApplicableReason && (
        <div
          style={{
            fontSize: 9.5,
            color: C.t4,
            fontFamily: M,
            marginTop: 4,
            fontStyle: "italic",
          }}
        >
          {notApplicableReason}
        </div>
      )}
    </div>
  );
};
