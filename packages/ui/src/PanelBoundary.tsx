/**
 * PanelBoundary — a designed error boundary for one panel (W4-1).
 *
 * One failed panel must never blank a page: wrap each independently-
 * rendered surface (a tab body, a card that fetches its own data) so a
 * render-time crash inside it degrades to a contained, Aurora-styled
 * fallback with a Retry affordance instead of unmounting the app.
 *
 * Retry resets the boundary and re-renders the children — enough for
 * transient data problems; a deterministic crash shows the fallback
 * again immediately (with the error name for the bug report).
 *
 * Usage:
 *   <PanelBoundary label="Ticket timeline">
 *     <TicketTimelinePanel ticketId={id}/>
 *   </PanelBoundary>
 */
import React from "react";
import { C, M } from "./theme/tokens.js";

export interface PanelBoundaryProps {
  /** Human name of the panel, shown in the fallback ("Pool Ops"). */
  label?: string;
  /** Compact single-line fallback for small cards / rows. */
  compact?: boolean;
  children?: React.ReactNode;
}

interface PanelBoundaryState {
  error: Error | null;
}

export class PanelBoundary extends React.Component<
  PanelBoundaryProps,
  PanelBoundaryState
> {
  override state: PanelBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // Server logs pick this up via the browser console; W4-5 wires
    // structured client reporting.
    console.error(
      `[PanelBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error,
    );
  }

  private reset = () => this.setState({ error: null });

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children ?? null;

    const name = this.props.label || "This panel";
    if (this.props.compact) {
      return (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            background: `${C.rd}14`,
            border: `1px solid ${C.rd}55`,
            borderRadius: 5,
            fontSize: 11,
            color: C.t2,
            fontFamily: M,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ color: C.rd }}>⚠</span>
          <span style={{ flex: 1 }}>{name} hit an error.</span>
          <span
            onClick={this.reset}
            style={{ color: C.cy, cursor: "pointer", letterSpacing: 1, fontSize: 10 }}
          >
            RETRY
          </span>
        </div>
      );
    }
    return (
      <div
        role="alert"
        style={{
          padding: 24,
          background: `${C.rd}0d`,
          border: `1px dashed ${C.rd}66`,
          borderRadius: 6,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: C.t1, marginBottom: 4 }}>
          ⚠ {name} hit an error and was contained.
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: C.t3,
            fontFamily: M,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          The rest of the page keeps working. ({error.name}
          {error.message ? `: ${error.message.slice(0, 120)}` : ""})
        </div>
        <span
          onClick={this.reset}
          style={{
            display: "inline-block",
            padding: "7px 16px",
            border: `1px solid ${C.cy}`,
            color: C.cy,
            fontSize: 10,
            fontFamily: M,
            letterSpacing: 1.5,
            cursor: "pointer",
            textTransform: "uppercase",
            borderRadius: 3,
          }}
        >
          ↻ Retry
        </span>
      </div>
    );
  }
}
