/**
 * HoldListTab — replaces the 4a placeholder LegalHoldPanel inside
 * the matter detail view. Lists every hold on the matter with a
 * defensibility scorecard summary inline.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import { DefensibilityBadge, JurisdictionPills, StatusPill } from "./badges";
import type { HoldSummaryDTO, HoldDefensibilityScoreDTO } from "./types";

export interface HoldListTabProps {
  matterId: string;
  endpoint?: string;
  /** Called when a row is clicked. apps/web wires Next.js navigation. */
  onSelect?: (holdId: string) => void;
  onCreate?: () => void;
}

export const HoldListTab: React.FC<HoldListTabProps> = ({
  matterId,
  endpoint = "/api/matter",
  onSelect,
  onCreate,
}) => {
  const [holds, setHolds] = useState<HoldSummaryDTO[] | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${endpoint}/${matterId}/holds`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: HoldSummaryDTO[]) => {
        if (!alive) return;
        setHolds(d);
        // Fire scorecard requests in parallel for compact summary cards.
        d.forEach((h) => {
          fetch(`${endpoint}/${matterId}/holds/${h.id}/scorecard`)
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((s: HoldDefensibilityScoreDTO) => {
              if (alive) setScores((prev) => ({ ...prev, [h.id]: s.score }));
            })
            .catch(() => {
              if (alive) setScores((prev) => ({ ...prev, [h.id]: null }));
            });
        });
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [endpoint, matterId]);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SH icon="🛑" title="Legal holds" sub={`${holds?.length ?? 0} on this matter`} />
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            style={{
              background: C.bl,
              border: "none",
              color: C.bg,
              padding: "6px 12px",
              fontFamily: F,
              fontWeight: 700,
              fontSize: 11,
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            + New hold
          </button>
        )}
      </div>
      {error && (
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M, marginTop: 8 }}>{error}</div>
      )}
      {!holds && (
        <div style={{ color: C.t3, fontSize: 11, marginTop: 10 }}>Loading…</div>
      )}
      {holds && holds.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, marginTop: 10 }}>
          No legal holds on this matter yet.
        </div>
      )}
      {holds && holds.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {holds.map((h) => (
            <div
              key={h.id}
              onClick={() => onSelect?.(h.id)}
              style={{
                border: `1px solid ${C.br}`,
                borderRadius: 6,
                padding: 12,
                cursor: onSelect ? "pointer" : "default",
                background: C.cd,
              }}
              onMouseEnter={(e) => onSelect && (e.currentTarget.style.background = C.cdH)}
              onMouseLeave={(e) => onSelect && (e.currentTarget.style.background = C.cd)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                      {h.holdNumber ?? "(draft)"}
                    </span>
                    <StatusPill status={h.status} />
                    <JurisdictionPills codes={h.jurisdictions} />
                    {h.affectsDepartedCustodians && (
                      <span
                        style={{
                          fontSize: 9,
                          color: C.rd,
                          fontFamily: M,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          border: `1px solid ${C.rd}`,
                          borderRadius: 3,
                        }}
                      >
                        Departed custodians
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: F, fontSize: 13, color: C.t1, fontWeight: 600 }}>
                    {h.title}
                  </div>
                  {h.scopeDescription && (
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 4, maxWidth: 720 }}>
                      {h.scopeDescription.slice(0, 240)}
                      {h.scopeDescription.length > 240 ? "…" : ""}
                    </div>
                  )}
                </div>
                {scores[h.id] !== undefined && scores[h.id] !== null && (
                  <DefensibilityBadge score={scores[h.id] as number} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
