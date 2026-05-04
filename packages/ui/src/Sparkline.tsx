/**
 * Sparkline — minimal trend chart for any 0..100-ish numeric series.
 * Lives in @aegis/ui so any module (legal hold, risk graph, spend,
 * privacy incidents) can reuse the same primitive.
 *
 * Renders an SVG with a path connecting normalized points. No axes,
 * no gridlines. Optional color band (red/amber/green) tied to the
 * latest value. Hovering a point surfaces a tooltip via title attr;
 * the consumer can layer richer tooltips on top with absolute
 * positioning if needed.
 *
 * Renders nothing for empty / single-point series.
 */
import React, { useMemo } from "react";
import { C } from "./theme/tokens.js";

export interface SparklinePoint {
  /** Display label (date / iso / etc.) — used in the title attribute. */
  label: string;
  value: number;
}

export interface SparklineProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  /** Domain — defaults to [0, 100] which is the defensibility scale. */
  min?: number;
  max?: number;
  /** Override the band logic and lock to a single color. */
  color?: string;
  /** Optional click handler — adds cursor:pointer + role=button. */
  onClick?: () => void;
  /** Aria label for the chart as a whole. */
  ariaLabel?: string;
}

/**
 * Defensibility band colors. Mirrors `defensibilityColor()` in
 * the legal-hold badges so the sparkline visually matches the badge
 * next to it. Other consumers can pass `color` to override.
 */
function bandColor(latestPct: number): string {
  if (latestPct >= 80) return C.gn;
  if (latestPct >= 60) return C.am;
  return C.rd;
}

export const Sparkline: React.FC<SparklineProps> = ({
  points,
  width = 100,
  height = 26,
  min = 0,
  max = 100,
  color,
  onClick,
  ariaLabel = "Sparkline",
}) => {
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const range = max - min || 1;
    const step = points.length === 1 ? 0 : width / (points.length - 1);
    return points
      .map((p, i) => {
        const clamped = Math.max(min, Math.min(max, p.value));
        const norm = (clamped - min) / range;
        const x = i * step;
        const y = height - norm * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points, width, height, min, max]);

  if (points.length === 0) return null;
  if (points.length === 1) {
    // Single point — render a small dot as a trend placeholder.
    const last = points[points.length - 1];
    if (!last) return null;
    const stroke = color ?? bandColor(last.value);
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <circle cx={width / 2} cy={height / 2} r={2} fill={stroke} />
      </svg>
    );
  }

  const last = points[points.length - 1];
  const stroke = color ?? bandColor(last?.value ?? 0);

  // Coordinates of the last point so we can render an emphasis dot.
  const lastX = (points.length - 1) * (width / (points.length - 1));
  const lastY =
    height -
    (Math.max(min, Math.min(max, last?.value ?? min)) - min) /
      (max - min || 1) *
      height;

  // Title text combines the latest value + the count of points so
  // a reader without hover (touch device) gets the headline number.
  const title = `${ariaLabel}: ${points.length} points, latest ${last?.value ?? "—"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={onClick ? "button" : "img"}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    >
      <title>{title}</title>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.2} fill={stroke} />
    </svg>
  );
};
