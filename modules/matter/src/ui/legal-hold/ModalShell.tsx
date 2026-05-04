/**
 * ModalShell — portal-rendered modal primitive used by the legal-hold
 * workspace's rail-card detail modals.
 *
 * Why a portal: Aurora's `Card` atom uses `animation: fu .35s ease both`
 * whose final keyframe leaves `transform: translateY(0)` on the
 * element. Per the CSS spec, any non-identity `transform` creates a
 * containing block for `position: fixed` descendants — so a fixed-
 * position modal rendered inside a Card gets scoped to that card's
 * 320px-wide rail column instead of the full viewport. Portalling
 * to `document.body` escapes every Card ancestor and guarantees the
 * modal centers and sizes against the viewport.
 *
 * Behaviour:
 *   - Backdrop click closes (`onClose`).
 *   - Escape closes.
 *   - Content scrolls internally when taller than `maxHeight` (80vh).
 *   - Always-visible top-right close (X) regardless of content height.
 *   - Renders nothing during SSR (`document` undefined).
 */
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { C, F, M, SH } from "@aegis/ui";

export interface ModalShellProps {
  onClose: () => void;
  ariaLabel: string;
  title: string;
  icon?: string;
  sub?: string;
  /** Optional element rendered next to the title (e.g. a badge). */
  headerRight?: React.ReactNode;
  /** Optional override for the inner panel's maxWidth. Defaults to 640. */
  maxWidth?: number;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  onClose,
  ariaLabel,
  title,
  icon,
  sub,
  headerRight,
  maxWidth = 640,
  children,
}) => {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          borderRadius: 8,
          padding: 18,
          width: "100%",
          maxWidth,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          fontFamily: F,
          color: C.t1,
          boxShadow: "0 14px 48px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <SH icon={icon} title={title} sub={sub} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent",
                border: `1px solid ${C.br}`,
                color: C.t2,
                width: 30,
                height: 30,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: M,
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
