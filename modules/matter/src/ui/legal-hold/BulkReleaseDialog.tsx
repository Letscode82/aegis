/**
 * BulkReleaseDialog — destructive bulk-release of a custodian
 * subset. Requires a release reason and a typed-confirmation step
 * (the user must type "RELEASE" — matches the existing destructive-
 * action pattern in the matter close flow).
 */
import React, { useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

export interface BulkReleaseDialogProps {
  matterId: string;
  holdId: string;
  custodians: Array<{ personId: string; personName: string }>;
  onClose: () => void;
  onApplied: (succeeded: number) => void;
}

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

export const BulkReleaseDialog: React.FC<BulkReleaseDialogProps> = ({
  matterId,
  holdId,
  custodians,
  onClose,
  onApplied,
}) => {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    reason.trim().length > 0 &&
    confirm.trim().toUpperCase() === "RELEASE" &&
    !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/bulk-release`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            personIds: custodians.map((c) => c.personId),
            releaseReason: reason.trim(),
          }),
        },
      );
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      const result = (await r.json()) as { succeeded: number };
      onApplied(result.succeeded);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Bulk release custodians"
      title={`Bulk release · ${custodians.length} custodians`}
      icon="⚠"
      sub="Destructive action. Releasing a custodian removes preservation obligations on their data sources."
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
        each custodian below will be released, their preservation
        obligations end, and a `CUSTODIAN_PARTIALLY_RELEASED` event is
        chain-sealed. The hold itself stays open for any non-released
        custodians.
      </div>

      <div
        style={{
          border: `1px solid ${C.br}`,
          borderRadius: 4,
          padding: "8px 10px",
          maxHeight: 160,
          overflowY: "auto",
          marginBottom: 12,
          background: C.s1,
        }}
      >
        {custodians.map((c) => (
          <div
            key={c.personId}
            style={{
              fontFamily: F,
              fontSize: 11,
              color: C.t1,
              padding: "2px 0",
            }}
          >
            {c.personName}{" "}
            <span style={{ color: C.t4, fontFamily: M, fontSize: 9.5 }}>
              {c.personId.slice(0, 8)}…
            </span>
          </div>
        ))}
      </div>

      <Field label="Release reason (required, on the chain)">
        <textarea
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Matter closeout, custodians no longer in scope per court order 2026-04-30."'
          rows={3}
          style={{
            ...inputStyle,
            fontFamily: F,
            resize: "vertical",
            minHeight: 70,
          }}
        />
      </Field>

      <Field label='Type "RELEASE" to confirm'>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="RELEASE"
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
            cursor: ready ? "pointer" : "default",
            fontFamily: F,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {submitting
            ? "Releasing…"
            : `Release ${custodians.length} custodians`}
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
