/**
 * IssueHoldConfirmDialog — pre-flight + paranoia confirmation for
 * the destructive "Issue Hold" action (sub-PR 4c.4, Item 11).
 *
 * Three sections:
 *   1. What will happen — counts of custodians + data sources +
 *      jurisdictions, plus the notice template (when one exists).
 *   2. Pre-flight checks — block / warn / pass list. If any
 *      `block` is present the confirm button stays disabled
 *      regardless of the typed-confirmation field.
 *   3. Confirmation — required free-text field. The user types the
 *      hold's title to enable the confirm button (matches the
 *      GitHub-style destructive-confirm pattern).
 *
 * Issuing a hold is essentially irreversible (every event is
 * chain-sealed). Sophisticated users expect the dry-run preview;
 * incumbents all ship it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";
import type { HoldDetailDTO, HoldWorkspaceCounts } from "./types";

interface CustodianPreview {
  personId: string;
  personName: string;
}

interface PreflightCheck {
  level: "pass" | "warn" | "block";
  label: string;
  detail?: string;
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

export interface IssueHoldConfirmDialogProps {
  matterId: string;
  holdId: string;
  hold: HoldDetailDTO;
  counts: HoldWorkspaceCounts;
  hasTriggerEvent: boolean;
  custodians: CustodianPreview[];
  /** Fired after the issue request succeeds. */
  onIssued: () => void;
  onClose: () => void;
}

export const IssueHoldConfirmDialog: React.FC<IssueHoldConfirmDialogProps> = ({
  matterId,
  holdId,
  hold,
  counts,
  hasTriggerEvent,
  custodians,
  onIssued,
  onClose,
}) => {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [showAllCustodians, setShowAllCustodians] = useState(false);
  const [templates, setTemplates] = useState<
    { id: string; name: string; version: number; jurisdictionKey: string | null }[] | null
  >(null);

  // Surface available notice templates so the user can preview which
  // template will be used and confirm jurisdiction coverage.
  useEffect(() => {
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/notice-templates`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: { templates?: { id: string; name: string; version: number; jurisdictionKey: string | null }[] } | null) => {
          if (!alive || !d?.templates) return;
          setTemplates(d.templates);
        },
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [matterId, holdId]);

  const checks = useMemo<PreflightCheck[]>(() => {
    const out: PreflightCheck[] = [];
    if (hasTriggerEvent) {
      out.push({ level: "pass", label: "Trigger event recorded" });
    } else {
      out.push({
        level: "block",
        label: "Trigger event missing",
        detail:
          "Record the trigger event before issuing — anchors the duty-to-preserve date.",
      });
    }
    if (counts.custodians > 0) {
      out.push({
        level: "pass",
        label: `${counts.custodians} custodian${counts.custodians === 1 ? "" : "s"} on hold`,
      });
    } else {
      out.push({
        level: "block",
        label: "No custodians on hold",
        detail: "Add at least one custodian before issuing.",
      });
    }
    // Templates pre-flight: warn (not block) when the hold has
    // jurisdictions and no template matches one of them.
    if (templates) {
      const jurs = hold.jurisdictions ?? [];
      const tplJurs = new Set(
        templates.map((t) => t.jurisdictionKey).filter(Boolean) as string[],
      );
      const hasDefault = templates.some((t) => t.jurisdictionKey === null);
      const missing = jurs.filter((j) => !tplJurs.has(j));
      if (missing.length > 0 && !hasDefault) {
        out.push({
          level: "warn",
          label: `No template for ${missing.join(", ")}`,
          detail:
            "Hold can still issue, but custodians in those jurisdictions won't get a tailored notice.",
        });
      } else if (missing.length > 0 && hasDefault) {
        out.push({
          level: "warn",
          label: `Default template will cover ${missing.join(", ")}`,
          detail:
            "No jurisdiction-specific template for those — the default applies.",
        });
      } else {
        out.push({ level: "pass", label: "Notice template available" });
      }
    }
    if (counts.dataSources === 0 && counts.custodians > 0) {
      out.push({
        level: "warn",
        label: "No data sources mapped",
        detail:
          "Custodians can acknowledge, but preservation actions can't run until at least one source per custodian is mapped.",
      });
    }
    return out;
  }, [hasTriggerEvent, counts, templates, hold.jurisdictions]);

  const blocked = checks.some((c) => c.level === "block");
  const titleMatches = confirm.trim() === hold.title.trim();
  const ready = !blocked && titleMatches && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/issue`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success("Hold issued.");
      onIssued();
    } catch (e) {
      setError(String(e));
      toast.error(`Issue hold failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  const displayedCustodians = showAllCustodians
    ? custodians
    : custodians.slice(0, 5);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Confirm Issue Hold"
      title="Issue hold"
      icon="🛡"
      sub={`This is a destructive, audit-chain-sealed action. Type the hold title to confirm.`}
      maxWidth={700}
    >
      <SectionHeader text="What will happen" />
      <SummaryRow
        label="Custodians"
        value={`${counts.custodians} will be notified`}
      >
        {custodians.length > 0 && (
          <div
            style={{
              marginTop: 4,
              fontFamily: F,
              fontSize: 10.5,
              color: C.t2,
            }}
          >
            {displayedCustodians.map((c, i) => (
              <span key={c.personId}>
                {c.personName}
                {i < displayedCustodians.length - 1 ? " · " : ""}
              </span>
            ))}
            {custodians.length > 5 && !showAllCustodians && (
              <button
                type="button"
                onClick={() => setShowAllCustodians(true)}
                style={linkBtn()}
              >
                {" "}
                +{custodians.length - 5} more
              </button>
            )}
          </div>
        )}
      </SummaryRow>
      <SummaryRow
        label="Data sources"
        value={`${counts.dataSources} flagged for preservation`}
      />
      <SummaryRow
        label="Jurisdictions"
        value={
          hold.jurisdictions.length > 0
            ? hold.jurisdictions.join(", ")
            : "(none)"
        }
      />
      <SummaryRow
        label="Notice template"
        value={
          templates === null
            ? "Loading…"
            : templates.length > 0
              ? `${templates.length} available — composer chooses at issuance`
              : "(none configured — can still issue, no notice will go out)"
        }
      />

      <SectionHeader text="Pre-flight checks" />
      <div
        style={{
          display: "grid",
          gap: 5,
          padding: "8px 10px",
          background: C.s1,
          borderRadius: 4,
          marginBottom: 14,
        }}
      >
        {checks.map((c, i) => (
          <CheckRow key={i} check={c} />
        ))}
      </div>

      <SectionHeader text="Confirmation" />
      <div
        style={{
          fontSize: 10.5,
          fontFamily: F,
          color: C.t3,
          marginBottom: 6,
        }}
      >
        Type the hold&apos;s title{" "}
        <code
          style={{
            background: C.s1,
            border: `1px solid ${C.br}`,
            padding: "1px 6px",
            borderRadius: 3,
            fontFamily: M,
            fontSize: 10.5,
            color: C.t1,
          }}
        >
          {hold.title}
        </code>{" "}
        to confirm.
      </div>
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type the hold title…"
        style={inputStyle}
        disabled={blocked}
      />
      {blocked && (
        <div
          style={{
            marginTop: 6,
            fontFamily: M,
            fontSize: 10.5,
            color: C.rd,
          }}
        >
          Pre-flight checks must pass before you can confirm.
        </div>
      )}

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
          title={
            blocked
              ? "Resolve pre-flight blocks first."
              : !titleMatches
                ? "Type the hold title to enable."
                : undefined
          }
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
          {submitting ? "Issuing…" : "Confirm issue hold"}
        </button>
      </div>
    </ModalShell>
  );
};

const SectionHeader: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: M,
      fontSize: 9.5,
      color: C.t3,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      borderBottom: `1px solid ${C.br}`,
      paddingBottom: 4,
      marginBottom: 8,
      marginTop: 6,
    }}
  >
    {text}
  </div>
);

const SummaryRow: React.FC<{
  label: string;
  value: string;
  children?: React.ReactNode;
}> = ({ label, value, children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "150px 1fr",
      gap: 12,
      padding: "5px 0",
      fontSize: 11.5,
      fontFamily: F,
      borderBottom: `1px solid ${C.br}22`,
    }}
  >
    <span
      style={{
        fontFamily: M,
        fontSize: 10,
        color: C.t3,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
    <span style={{ color: C.t1 }}>
      <span>{value}</span>
      {children}
    </span>
  </div>
);

const CheckRow: React.FC<{ check: PreflightCheck }> = ({ check }) => {
  const color =
    check.level === "block" ? C.rd : check.level === "warn" ? C.am : C.gn;
  const icon =
    check.level === "block" ? "✕" : check.level === "warn" ? "⚠" : "✓";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr",
        gap: 8,
        fontSize: 11,
        fontFamily: F,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: M,
          fontSize: 12,
          color,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {icon}
      </span>
      <span style={{ color: C.t1 }}>
        {check.label}
        {check.detail && (
          <div
            style={{
              fontSize: 10,
              color: C.t3,
              fontFamily: F,
              marginTop: 1,
              lineHeight: 1.4,
            }}
          >
            {check.detail}
          </div>
        )}
      </span>
    </div>
  );
};

function linkBtn(): React.CSSProperties {
  return {
    background: "transparent",
    border: "none",
    color: C.bl,
    fontFamily: F,
    fontSize: 10.5,
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  };
}
