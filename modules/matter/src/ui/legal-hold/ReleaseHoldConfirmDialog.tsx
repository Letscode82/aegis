/**
 * ReleaseHoldConfirmDialog — destructive confirmation for the
 * "Release Hold" action (sub-PR 4c.4, Item 11). Mirrors the
 * IssueHoldConfirmDialog paranoia pattern: required release reason
 * + type-the-title-to-confirm.
 */
import React, { useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";
import type { HoldDetailDTO, HoldWorkspaceCounts } from "./types";

const inputStyle: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.br}`,
  padding: "6px 10px",
  borderRadius: 4,
  color: C.t1,
  fontFamily: M,
  fontSize: 11,
  outline: "none",
  width: "100%",
};

export interface ReleaseHoldConfirmDialogProps {
  matterId: string;
  holdId: string;
  hold: HoldDetailDTO;
  counts: HoldWorkspaceCounts;
  onReleased: () => void;
  onClose: () => void;
}

export const ReleaseHoldConfirmDialog: React.FC<ReleaseHoldConfirmDialogProps> = ({
  matterId,
  holdId,
  hold,
  counts,
  onReleased,
  onClose,
}) => {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleMatches = confirm.trim() === hold.title.trim();
  const ready =
    reason.trim().length > 0 && titleMatches && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/release`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ releaseReason: reason.trim() }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success(
        `Hold released (reason: ${reason.slice(0, 60)}${reason.length > 60 ? "…" : ""}).`,
      );
      onReleased();
    } catch (e) {
      setError(String(e));
      toast.error(`Release hold failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Confirm Release Hold"
      title="Release hold"
      icon="⚠"
      sub="Releases preservation obligations for every active custodian. Chain-sealed; cannot be undone."
      maxWidth={620}
    >
      <div
        style={{
          padding: 10,
          background: `${C.rd}10`,
          border: `1px solid ${C.rd}55`,
          borderRadius: 4,
          fontSize: 10.5,
          fontFamily: F,
          color: C.t1,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        <span style={{ fontFamily: M, color: C.rd, fontWeight: 700 }}>
          Heads up —
        </span>{" "}
        every active custodian on this hold ({counts.custodians} total,{" "}
        {counts.custodians - counts.custodiansReleased} still on hold) will
        be released, preservation obligations end, and a `HOLD_RELEASED`
        event is chain-sealed.
      </div>

      <Field label="Release reason (required, on the chain)">
        <textarea
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Matter settled, court order 2026-04-30 lifts preservation duty across all custodians."'
          rows={4}
          style={{
            ...inputStyle,
            fontFamily: F,
            fontSize: 11.5,
            resize: "vertical",
            minHeight: 90,
          }}
        />
      </Field>

      <Field label="Type the hold title to confirm">
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={hold.title}
          style={inputStyle}
        />
      </Field>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            border: `1px solid ${C.rd}`,
            background: C.rdG,
            color: C.rd,
            fontSize: 10.5,
            fontFamily: M,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t1,
            padding: "7px 14px",
            borderRadius: 4,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: F,
            fontSize: 11,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          style={{
            background: ready ? C.rd : C.br,
            color: ready ? C.bg : C.t3,
            border: "none",
            padding: "7px 18px",
            borderRadius: 4,
            cursor: ready ? "pointer" : "not-allowed",
            fontFamily: F,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {submitting ? "Releasing…" : "Confirm release hold"}
        </button>
      </div>
    </ModalShell>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block", marginBottom: 10 }}>
    <span
      style={{
        display: "block",
        fontFamily: F,
        fontSize: 10,
        color: C.t3,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {label}
    </span>
    {children}
  </label>
);
