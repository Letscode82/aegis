/**
 * Stepper — a crisp horizontal step indicator for multi-step flows
 * (hold wizard, Case AutoPilot, any guided sequence).
 *
 * Numbered circles with a green check for completed steps, a filled
 * accent circle for the current step, and a hollow circle for
 * upcoming steps; connectors between circles fill green as the flow
 * advances. Labels sit below each circle. Theme-aware via Aurora
 * tokens; no external deps.
 *
 * Optionally clickable: pass `onStepClick` to let the user jump back
 * to a visited step (steps at or before `furthest` are considered
 * visited). Upcoming, unvisited steps stay inert.
 */
import React from "react";
import { C, F, M } from "./theme/tokens.js";

export interface StepperStep {
  label: string;
  sublabel?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 1-indexed current step. */
  current: number;
  /** 1-indexed furthest visited step (defaults to `current`). Steps at
   *  or before this are clickable when `onStepClick` is given. */
  furthest?: number;
  onStepClick?: (step: number) => void;
  compact?: boolean;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  current,
  furthest,
  onStepClick,
  compact = false,
}) => {
  const reach = Math.max(furthest ?? current, current);
  const circle = compact ? 26 : 32;
  const labelSize = compact ? 10.5 : 11.5;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: "100%",
        fontFamily: F,
      }}
    >
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const visited = n <= reach;
        const clickable = Boolean(onStepClick) && visited && !active;

        const ringColor = done ? C.gn : active ? C.bl : C.br;
        const fill = done ? C.gn : active ? C.bl : "transparent";
        const numColor = done || active ? C.bg : C.t4;

        return (
          <React.Fragment key={i}>
            <div
              onClick={clickable ? () => onStepClick?.(n) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onStepClick?.(n);
                      }
                    }
                  : undefined
              }
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                flex: "0 0 auto",
                width: compact ? 92 : 120,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div
                style={{
                  width: circle,
                  height: circle,
                  borderRadius: "50%",
                  background: fill,
                  border: `2px solid ${ringColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: M,
                  fontSize: compact ? 12 : 13.5,
                  fontWeight: 700,
                  color: numColor,
                  boxShadow: active ? `0 0 0 4px ${C.blG}` : "none",
                  transition: "background .2s, border-color .2s, box-shadow .2s",
                  flex: "none",
                }}
              >
                {done ? "✓" : n}
              </div>
              <div style={{ textAlign: "center", lineHeight: 1.25 }}>
                <div
                  style={{
                    fontSize: labelSize,
                    fontWeight: active ? 700 : 600,
                    color: active ? C.t1 : done ? C.t2 : C.t3,
                  }}
                >
                  {s.label}
                </div>
                {s.sublabel && (
                  <div style={{ fontSize: 9.5, color: C.t4, marginTop: 1 }}>
                    {s.sublabel}
                  </div>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden="true"
                style={{
                  flex: "1 1 auto",
                  height: 2,
                  minWidth: 12,
                  marginTop: circle / 2 - 1,
                  background: n < current ? C.gn : C.br,
                  transition: "background .2s",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
