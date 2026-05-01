/**
 * MatterDashboard — KPI strip + status / type distributions + age buckets.
 *
 * Mounted at /matter as the entry point into the module. Pulls
 * /api/matter/dashboard once on mount; no live updates yet.
 */
import React, { useEffect, useState } from "react";
import { Card, Stat, Bar, SH, C, F, M } from "@aegis/ui";
import type { DashboardStatsDTO } from "./types";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: C.t3,
  OPEN: C.bl,
  ACTIVE: C.gn,
  STAYED: C.am,
  CLOSED: C.t4,
  ARCHIVED: C.t4,
};

function formatMoney(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export interface MatterDashboardProps {
  endpoint?: string;
  initialStats?: DashboardStatsDTO;
}

export const MatterDashboard: React.FC<MatterDashboardProps> = ({
  endpoint = "/api/matter/dashboard",
  initialStats,
}) => {
  const [stats, setStats] = useState<DashboardStatsDTO | null>(initialStats ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialStats) return;
    let alive = true;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((json: DashboardStatsDTO) => alive && setStats(json))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [endpoint, initialStats]);

  if (error) {
    return (
      <Card>
        <div style={{ color: C.rd, fontFamily: M, fontSize: 12 }}>
          Failed to load dashboard: {error}
        </div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <div style={{ color: C.t3, fontFamily: M, fontSize: 12 }}>Loading…</div>
      </Card>
    );
  }

  const totalActive = stats.totalOpen + stats.totalActive + stats.totalStayed;
  const maxBucket = Math.max(1, ...stats.ageBuckets.map((b) => b.count));
  const maxByType = Math.max(1, ...stats.byType.map((b) => b.count));

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <SH icon="🗂" title="Matter Management" sub="Dashboard" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
          }}
        >
          <Stat l="Drafts" v={stats.totalDraft} c={C.t3} />
          <Stat l="Open" v={stats.totalOpen} c={C.bl} />
          <Stat l="Active" v={totalActive} c={C.gn} />
          <Stat l="Closed" v={stats.totalClosed} c={C.t4} />
          <Stat l="Exposure" v={formatMoney(stats.exposureSum)} c={C.am} />
          <Stat l="Spent YTD" v={formatMoney(stats.spentToDateSum)} c={C.or} />
        </div>
      </Card>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
      >
        <Card>
          <SH icon="📊" title="By status" />
          <div style={{ display: "grid", gap: 6 }}>
            {stats.byStatus.map((row) => (
              <div
                key={row.status}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 60px 1fr",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: C.t1, fontFamily: F }}>
                  {row.status}
                </div>
                <div style={{ fontSize: 11, color: C.t2, fontFamily: M }}>
                  {row.count}
                </div>
                <Bar
                  pct={(row.count / Math.max(1, totalActive + stats.totalDraft + stats.totalClosed)) * 100}
                  c={STATUS_COLORS[row.status] ?? C.bl}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SH icon="🏷" title="By type" />
          <div style={{ display: "grid", gap: 6 }}>
            {stats.byType
              .filter((t) => t.count > 0)
              .map((row) => (
                <div
                  key={row.type}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 60px 1fr",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 11, color: C.t1, fontFamily: F }}>
                    {row.type}
                  </div>
                  <div
                    style={{ fontSize: 11, color: C.t2, fontFamily: M }}
                  >
                    {row.count}
                  </div>
                  <Bar pct={(row.count / maxByType) * 100} c={C.bl} />
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card>
        <SH icon="⏳" title="Age (open + active matters)" />
        <div style={{ display: "grid", gap: 6 }}>
          {stats.ageBuckets.map((b) => (
            <div
              key={b.label}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 60px 1fr",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: C.t1, fontFamily: F }}>
                {b.label}
              </div>
              <div style={{ fontSize: 11, color: C.t2, fontFamily: M }}>
                {b.count}
              </div>
              <Bar pct={(b.count / maxBucket) * 100} c={C.tl} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
