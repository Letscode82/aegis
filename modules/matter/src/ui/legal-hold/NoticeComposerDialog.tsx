/**
 * NoticeComposerDialog — 4-step wizard that replaces the old single-
 * input "Paste a template id…" dialog from 4c.2.
 *
 * Steps:
 *   1. Select template      — dropdown from /notice-templates,
 *                             jurisdiction-matched first.
 *   2. Preview rendered text — server-rendered against a representative
 *                             custodian; user can inline-edit.
 *   3. Select recipients    — checkbox list defaulting to all
 *                             unacknowledged custodians.
 *   4. Confirm + send       — summary screen, then POST to /notices.
 *
 * Renders via ModalShell so the modal escapes Aurora `Card`'s
 * persistent-transform stacking context (see ModalShell.tsx for the
 * full root-cause notes on why the portal is required).
 *
 * Email sending is currently stubbed at the service layer — the
 * issuance and chain rows ARE the defensibility evidence. Real
 * delivery is documented as a sunset item in CLAUDE.md.
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

type Step = 1 | 2 | 3 | 4;

interface TemplateOption {
  id: string;
  name: string;
  version: number;
  jurisdictionKey: string | null;
  bodyHash: string;
  updatedAt: string;
}

interface RecipientRow {
  personId: string;
  name: string;
  email: string | null;
  role: string | null;
  acknowledgedAt: string | null;
  releasedAt: string | null;
}

interface PreviewResult {
  template: {
    id: string;
    name: string;
    version: number;
    jurisdictionKey: string | null;
  };
  rawBody: string;
  renderedBody: string;
  previewCustodian: {
    personId: string;
    name: string;
    email: string | null;
  } | null;
  recipients: RecipientRow[];
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

export interface NoticeComposerDialogProps {
  matterId: string;
  holdId: string;
  /**
   * Optional pre-selection of recipient personIds. Used by the bulk
   * "Send reminder to N selected" affordance from CustodiansPanel.
   */
  initialRecipientPersonIds?: string[];
  onClose: () => void;
  onIssued: (result: { recipientCount: number }) => void;
}

export const NoticeComposerDialog: React.FC<NoticeComposerDialogProps> = ({
  matterId,
  holdId,
  initialRecipientPersonIds,
  onClose,
  onIssued,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [matterJurisdictions, setMatterJurisdictions] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [editedBody, setEditedBody] = useState<string>("");
  const [recipientIds, setRecipientIds] = useState<Set<string>>(
    () => new Set(initialRecipientPersonIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 1 — load templates list.
  useEffect(() => {
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/notice-templates`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(
        (d: {
          matterJurisdictions: string[];
          templates: TemplateOption[];
        }) => {
          if (!alive) return;
          // Sort jurisdiction-matched first, then null-jurisdiction
          // (default), then everything else.
          const jur = new Set(d.matterJurisdictions);
          const ranked = [...d.templates].sort((a, b) => {
            const aMatch = a.jurisdictionKey && jur.has(a.jurisdictionKey);
            const bMatch = b.jurisdictionKey && jur.has(b.jurisdictionKey);
            if (aMatch !== bMatch) return aMatch ? -1 : 1;
            const aNull = a.jurisdictionKey === null;
            const bNull = b.jurisdictionKey === null;
            if (aNull !== bNull) return aNull ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          setTemplates(ranked);
          setMatterJurisdictions(d.matterJurisdictions);
          if (ranked[0]) setTemplateId(ranked[0].id);
        },
      )
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId]);

  // Step 2 — load preview when entering step 2 (or when template changes).
  useEffect(() => {
    if (step !== 2 || !templateId) return;
    let alive = true;
    setPreviewLoading(true);
    fetch(`/api/matter/${matterId}/holds/${holdId}/notices/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: PreviewResult) => {
        if (!alive) return;
        setPreview(d);
        setEditedBody(d.renderedBody);
        // Initialize recipients on first preview if the caller didn't
        // pre-select. Default = every unacknowledged, non-released
        // custodian.
        if (initialRecipientPersonIds === undefined) {
          setRecipientIds(
            new Set(
              d.recipients
                .filter((r) => !r.acknowledgedAt && !r.releasedAt)
                .map((r) => r.personId),
            ),
          );
        }
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setPreviewLoading(false));
    return () => {
      alive = false;
    };
  }, [step, templateId, matterId, holdId, initialRecipientPersonIds]);

  async function send() {
    if (!preview || !templateId) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/notices`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateId,
            editedBody:
              editedBody !== preview.renderedBody ? editedBody : undefined,
            recipientCustodianPersonIds: Array.from(recipientIds),
          }),
        },
      );
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      const result = (await r.json()) as { recipientCount: number };
      onIssued(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance = useMemo(() => {
    if (step === 1) return !!templateId;
    if (step === 2) return !!preview && editedBody.trim().length > 0;
    if (step === 3) return recipientIds.size > 0;
    return true;
  }, [step, templateId, preview, editedBody, recipientIds]);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Issue notice"
      title="Issue notice"
      icon="📜"
      sub="Snapshots the template version + body hash at issuance for defensibility."
      maxWidth={780}
    >
      <Stepper step={step} />

      {step === 1 && (
        <Step1Template
          templates={templates}
          matterJurisdictions={matterJurisdictions}
          templateId={templateId}
          onPick={setTemplateId}
        />
      )}
      {step === 2 && (
        <Step2Preview
          loading={previewLoading}
          preview={preview}
          editedBody={editedBody}
          onEdit={setEditedBody}
        />
      )}
      {step === 3 && (
        <Step3Recipients
          recipients={preview?.recipients ?? []}
          selected={recipientIds}
          onToggle={(id) => {
            setRecipientIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onSelectAll={() => {
            const all = new Set(
              (preview?.recipients ?? [])
                .filter((r) => !r.releasedAt)
                .map((r) => r.personId),
            );
            setRecipientIds(all);
          }}
          onSelectNone={() => setRecipientIds(new Set())}
        />
      )}
      {step === 4 && preview && (
        <Step4Confirm
          preview={preview}
          recipientCount={recipientIds.size}
          edited={editedBody !== preview.renderedBody}
        />
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
          justifyContent: "space-between",
          marginTop: 14,
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (step === 1) onClose();
            else setStep((step - 1) as Step);
          }}
          disabled={submitting}
          style={secondaryBtn(submitting)}
        >
          {step === 1 ? "Cancel" : "← Back"}
        </button>
        {step < 4 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setStep((step + 1) as Step)}
            style={primaryBtn(canAdvance)}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || recipientIds.size === 0}
            onClick={send}
            style={primaryBtn(!submitting && recipientIds.size > 0)}
          >
            {submitting
              ? "Sending…"
              : `Send to ${recipientIds.size} recipient${recipientIds.size === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </ModalShell>
  );
};

// ── Stepper ─────────────────────────────────────────────────────

const STEP_LABELS = ["Template", "Preview", "Recipients", "Confirm"];

const Stepper: React.FC<{ step: Step }> = ({ step }) => (
  <div
    style={{
      display: "flex",
      gap: 4,
      marginBottom: 14,
      fontFamily: M,
      fontSize: 9.5,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    }}
  >
    {STEP_LABELS.map((label, i) => {
      const idx = (i + 1) as Step;
      const active = idx === step;
      const done = idx < step;
      return (
        <div
          key={label}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderBottom: `2px solid ${active ? C.bl : done ? C.gn : C.br}`,
            color: active ? C.t1 : done ? C.gn : C.t4,
            fontWeight: active ? 700 : 500,
          }}
        >
          {idx}. {label}
        </div>
      );
    })}
  </div>
);

// ── Step 1: select template ─────────────────────────────────────

const Step1Template: React.FC<{
  templates: TemplateOption[] | null;
  matterJurisdictions: string[];
  templateId: string;
  onPick: (id: string) => void;
}> = ({ templates, matterJurisdictions, templateId, onPick }) => {
  if (!templates) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        Loading templates…
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        No active notice templates in this organisation. Create one in the
        notice-template admin (admin module) before issuing.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          fontFamily: M,
          color: C.t4,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Matter jurisdictions:{" "}
        {matterJurisdictions.length > 0
          ? matterJurisdictions.join(", ")
          : "(none)"}
      </div>
      {templates.map((t) => {
        const active = t.id === templateId;
        const matched =
          t.jurisdictionKey &&
          matterJurisdictions.includes(t.jurisdictionKey);
        return (
          <label
            key={t.id}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr 100px 130px",
              gap: 8,
              padding: "8px 10px",
              border: `1px solid ${active ? C.bl : C.br}`,
              background: active ? `${C.bl}15` : C.s1,
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: F,
              fontSize: 11,
            }}
          >
            <input
              type="radio"
              name="composer-template"
              checked={active}
              onChange={() => onPick(t.id)}
            />
            <span style={{ color: C.t1 }}>
              {t.name}
              {matched && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    fontFamily: M,
                    color: C.gn,
                    letterSpacing: 0.4,
                  }}
                >
                  ✓ jurisdiction match
                </span>
              )}
            </span>
            <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
              v{t.version}
            </span>
            <span style={{ fontFamily: M, fontSize: 10, color: C.t4 }}>
              {t.jurisdictionKey ?? "default"}
            </span>
          </label>
        );
      })}
    </div>
  );
};

// ── Step 2: preview + edit ──────────────────────────────────────

const Step2Preview: React.FC<{
  loading: boolean;
  preview: PreviewResult | null;
  editedBody: string;
  onEdit: (s: string) => void;
}> = ({ loading, preview, editedBody, onEdit }) => {
  if (loading) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        Rendering preview…
      </div>
    );
  }
  if (!preview) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        Pick a template first.
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontFamily: M,
          color: C.t3,
          letterSpacing: 0.4,
        }}
      >
        Preview rendered against{" "}
        <span style={{ color: C.t1, fontFamily: F, fontWeight: 600 }}>
          {preview.previewCustodian?.name ?? "(no custodian to preview)"}
        </span>
        . Edits apply to this issuance only — the template stays unchanged.
      </div>
      <textarea
        value={editedBody}
        onChange={(e) => onEdit(e.target.value)}
        rows={16}
        style={{
          ...inputStyle,
          fontFamily: M,
          fontSize: 11.5,
          lineHeight: 1.45,
          resize: "vertical",
          minHeight: 240,
        }}
      />
    </div>
  );
};

// ── Step 3: select recipients ───────────────────────────────────

const Step3Recipients: React.FC<{
  recipients: RecipientRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}> = ({ recipients, selected, onToggle, onSelectAll, onSelectNone }) => (
  <div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontFamily: M,
          fontSize: 10.5,
          color: C.t3,
          letterSpacing: 0.4,
        }}
      >
        {selected.size} of {recipients.length} selected
      </span>
      <span style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onSelectAll}
          style={miniBtn(C.bl)}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onSelectNone}
          style={miniBtn(C.t3)}
        >
          Select none
        </button>
      </span>
    </div>
    <div
      style={{
        maxHeight: 320,
        overflowY: "auto",
        border: `1px solid ${C.br}`,
        borderRadius: 4,
      }}
    >
      {recipients.map((r) => {
        const checked = selected.has(r.personId);
        const released = !!r.releasedAt;
        const acked = !!r.acknowledgedAt;
        return (
          <label
            key={r.personId}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 200px 150px",
              gap: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontFamily: F,
              cursor: released ? "default" : "pointer",
              opacity: released ? 0.45 : 1,
              borderBottom: `1px solid ${C.br}22`,
              background: checked ? `${C.bl}12` : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={released}
              onChange={() => onToggle(r.personId)}
            />
            <span style={{ color: C.t1 }}>
              {r.name}
              {released && (
                <span style={{ marginLeft: 6, color: C.t4, fontSize: 9 }}>
                  RELEASED
                </span>
              )}
            </span>
            <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
              {r.email ?? "—"}
            </span>
            <span
              style={{
                fontFamily: M,
                fontSize: 10,
                color: acked ? C.gn : C.am,
                textAlign: "right",
              }}
            >
              {acked ? "✓ acknowledged" : "○ pending"}
            </span>
          </label>
        );
      })}
    </div>
  </div>
);

// ── Step 4: confirm ─────────────────────────────────────────────

const Step4Confirm: React.FC<{
  preview: PreviewResult;
  recipientCount: number;
  edited: boolean;
}> = ({ preview, recipientCount, edited }) => (
  <div style={{ display: "grid", gap: 10 }}>
    <Summary label="Template">
      {preview.template.name} (v{preview.template.version})
      {preview.template.jurisdictionKey && (
        <span style={{ color: C.t3, fontFamily: M, fontSize: 10 }}>
          {" "}
          · {preview.template.jurisdictionKey}
        </span>
      )}
    </Summary>
    <Summary label="Body customised">
      {edited ? (
        <span style={{ color: C.am }}>
          Yes — body hash will reflect the edited content
        </span>
      ) : (
        <span style={{ color: C.gn }}>No — using template hash as snapshot</span>
      )}
    </Summary>
    <Summary label="Recipients">
      <span style={{ fontFamily: M, color: C.t1 }}>{recipientCount}</span>
      {" custodian"}
      {recipientCount === 1 ? "" : "s"}
    </Summary>
    <Summary label="Audit">
      One HoldNoticeIssuance row + one REMINDER_SENT timeline event per
      recipient, all chain-sealed via recordHoldEvent.
    </Summary>
    <div
      style={{
        marginTop: 4,
        padding: 10,
        border: `1px solid ${C.br}`,
        background: C.s1,
        borderRadius: 4,
        fontSize: 10.5,
        fontFamily: F,
        color: C.t3,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: C.am, fontFamily: M, fontWeight: 700 }}>
        Note —
      </span>{" "}
      AEGIS records the issuance and audit chain immediately. Real email
      delivery is a separate integration (sunset condition: when
      SES/Outlook/SMTP integration ships). Recipients in the audit log
      show "Recorded" until the delivery surface lands.
    </div>
  </div>
);

const Summary: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "150px 1fr",
      gap: 10,
      padding: "5px 0",
      borderBottom: `1px solid ${C.br}22`,
      fontSize: 11,
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
    <span style={{ color: C.t1, fontFamily: F }}>{children}</span>
  </div>
);

// ── shared bits ─────────────────────────────────────────────────

function primaryBtn(ready: boolean): React.CSSProperties {
  return {
    background: ready ? C.bl : C.br,
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

function miniBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}55`,
    color,
    padding: "3px 9px",
    borderRadius: 4,
    fontSize: 10,
    fontFamily: F,
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: 0.3,
  };
}
