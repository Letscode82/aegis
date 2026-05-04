/**
 * Shared visual primitives for the hold UI.
 *
 *  - StatusPill maps LegalHoldStatus -> Aurora colour.
 *  - DefensibilityBadge renders the 0..100 scorecard with a banded
 *    colour ramp (red < 60, amber 60-79, green 80-100).
 *  - JurisdictionPill renders ISO codes; AY-FED gets a distinct US
 *    federal colour, EU gets the GDPR amber, etc.
 */
import React from "react";
import { Pill, C, F, M } from "@aegis/ui";
import type { LegalHoldStatusKey } from "./types";

const STATUS: Record<LegalHoldStatusKey, string> = {
  DRAFT: C.t3,
  ISSUED: C.am,
  ACTIVE: C.bl,
  PARTIALLY_RELEASED: C.tl,
  RELEASED: C.gn,
};

export const StatusPill: React.FC<{ status: LegalHoldStatusKey }> = ({ status }) => (
  <Pill t={status.replace("_", " ")} c={STATUS[status]} />
);

const JURISDICTION_COLOR: Record<string, string> = {
  "US-CA": C.bl,
  "US-NY": C.bl,
  "US-FED": C.tl,
  EU: C.am,
  UK: C.pp,
};

export const JurisdictionPills: React.FC<{
  codes: string[];
  /** Optional click handler — when provided, each pill becomes a button. */
  onClickCode?: (code: string) => void;
}> = ({ codes, onClickCode }) => (
  <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
    {codes.map((c) => {
      const color = JURISDICTION_COLOR[c] ?? C.t3;
      if (!onClickCode) return <Pill key={c} t={c} c={color} />;
      return (
        <button
          key={c}
          type="button"
          onClick={() => onClickCode(c)}
          aria-label={`Show policy detail for ${c}`}
          style={{
            background: `${color}18`,
            border: `1px solid ${color}55`,
            color,
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 9.5,
            fontWeight: 600,
            fontFamily: M,
            letterSpacing: 0.3,
            lineHeight: "16px",
            cursor: "pointer",
          }}
        >
          {c}
        </button>
      );
    })}
  </span>
);

export function defensibilityColor(score: number): string {
  if (score >= 80) return C.gn;
  if (score >= 60) return C.am;
  return C.rd;
}

export const DefensibilityBadge: React.FC<{ score: number }> = ({ score }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 10px",
      borderRadius: 12,
      background: `${defensibilityColor(score)}1f`,
      border: `1px solid ${defensibilityColor(score)}`,
      color: defensibilityColor(score),
      fontFamily: M,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.4,
    }}
  >
    <span style={{ fontFamily: F, fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>
      Defensibility
    </span>
    <span>{score}/100</span>
  </span>
);
