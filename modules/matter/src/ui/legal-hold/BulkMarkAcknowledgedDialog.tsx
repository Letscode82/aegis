/**
 * BulkMarkAcknowledgedDialog — shows the affected custodians by
 * name, captures one shared reason, and POSTs to /bulk-mark-ack.
 * Atomic at the service layer: if any single ack fails, the whole
 * batch rolls back.
 */
import React, { useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

export interface BulkMarkAcknowledgedDialogProps {
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
  fontFamily: F,
  fontSize: 11,
  outline: "none",
  width: "100%",
};

export const BulkMarkAcknowledgedDialog: React.FC<BulkMarkAcknowledgedDialogProps> =
  ({ matterId, holdId, custodians, onClose, onApplied }) => {
    const [reason, setReason] = useState("");
    const [witness, setWitness] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ready = reason.trim().length > 0 && !submitting;

    async function submit() {
      if (!ready) return;
      setSubmitting(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/matter/${matterId}/holds/${holdId}/custodians/bulk-mark-ack`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              personIds: custodians.map((c) => c.personId),
              reason: reason.trim(),
              witness: witness.trim() || undefined,
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
        ariaLabel="Bulk mark acknowledged"
        title={`Bulk mark acknowledged · ${custodians.length} custodians`}
        icon="✍"
        sub="One transaction wraps all writes — partial failure rolls everything back."
        maxWidth={620}
      >
        <div
          style={{
            padding: 10,
            background: `${C.am}10`,
            border: `1px solid ${C.am}55`,
            borderRadius: 4,
            fontSize: 10.5,
            fontFamily: F,
            color: C.t2,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          One reason applies to every custodian in the batch. Each gets
          its own acknowledgment row with{" "}
          {`metadata.source = "admin_marked"`}.
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

        <Field label="Reason (required)">
          <textarea
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder='e.g. "Verbal acknowledgment from each on the Q2 incident-response call, 2026-05-04."'
            rows={3}
            style={{
              ...inputStyle,
              fontFamily: F,
              resize: "vertical",
              minHeight: 70,
            }}
          />
        </Field>
        <Field label="Witness / signature (optional)">
          <input
            value={witness}
            onChange={(e) => setWitness(e.target.value)}
            placeholder="Name of anyone else present, or notary reference"
            style={{ ...inputStyle, fontFamily: M }}
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
            style={secondaryBtn(submitting)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!ready}
            style={primaryBtn(ready, C.gn)}
          >
            {submitting
              ? "Marking…"
              : `Mark ${custodians.length} acknowledged`}
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

function primaryBtn(ready: boolean, color: string): React.CSSProperties {
  return {
    background: ready ? color : C.br,
    color: ready ? C.bg : C.t3,
    border: "none",
    padding: "7px 18px",
    borderRadius: 4,
    fontFamily: F,
    fontSize: 11,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}

function secondaryBtn(submitting: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.br}`,
    color: C.t1,
    padding: "7px 14px",
    borderRadius: 4,
    cursor: submitting ? "wait" : "pointer",
    fontFamily: F,
    fontSize: 11,
  };
}
