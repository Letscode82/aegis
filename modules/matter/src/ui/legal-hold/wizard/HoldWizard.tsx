/**
 * HoldWizard — five-step guided creation flow (sub-PR 4d.0).
 *
 * The shell coordinates:
 *   - step navigation (1 → 5, can't skip ahead, can go back)
 *   - per-step validation gate on the Next button
 *   - cross-step state via useState, auto-saved to localStorage
 *     keyed by matterId so closing the browser mid-flow resumes
 *   - the final issue-hold call which transitions into ProgressPanel
 *
 * The shell is intentionally a thin coordinator; each Step* component
 * owns its own form state and patches WizardState on change.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, C, F, M, useToast } from "@aegis/ui";
import { Step1Scope } from "./Step1Scope";
import { Step2Custodians } from "./Step2Custodians";
import { Step3DataSources } from "./Step3DataSources";
import { Step4Notice } from "./Step4Notice";
import { Step5ReviewIssue } from "./Step5ReviewIssue";
import { ProgressPanel } from "./ProgressPanel";
import {
  EMPTY_WIZARD_STATE,
  type WizardState,
  type WizardStep,
} from "./types";

const STORAGE_KEY = (matterId: string) => `aegis.hold-wizard.${matterId}`;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Scope & Trigger",
  2: "Custodians",
  3: "Data Sources",
  4: "Notice",
  5: "Review & Issue",
};

export interface HoldWizardProps {
  matterId: string;
  /** Called when the wizard issues successfully and counsel clicks
   *  "View Hold". apps/web routes to the hold workspace. */
  onComplete?: (holdId: string) => void;
  onCancel?: () => void;
}

export const HoldWizard: React.FC<HoldWizardProps> = ({
  matterId,
  onComplete,
  onCancel,
}) => {
  const toast = useToast();
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>(EMPTY_WIZARD_STATE);
  const [stepValid, setStepValid] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issuedHoldId, setIssuedHoldId] = useState<string | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(matterId));
      if (raw) {
        const parsed = JSON.parse(raw) as WizardState;
        setState({ ...EMPTY_WIZARD_STATE, ...parsed });
        setStep(parsed.furthestStep ?? 1);
      }
    } catch {
      // Corrupted local state — start clean.
    }
  }, [matterId]);

  // Auto-save on every state change. Cheap; localStorage write is
  // synchronous in modern browsers and the state is small.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY(matterId),
        JSON.stringify(state),
      );
    } catch {
      // Quota exceeded or storage disabled — non-fatal.
    }
  }, [matterId, state]);

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  function next() {
    if (!stepValid || step === 5) return;
    const nextStep = (step + 1) as WizardStep;
    setStep(nextStep);
    setState((prev) => ({
      ...prev,
      furthestStep:
        nextStep > prev.furthestStep ? nextStep : prev.furthestStep,
    }));
    setStepValid(false);
  }

  function back() {
    if (step === 1) return;
    setStep((step - 1) as WizardStep);
  }

  function reset() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY(matterId));
    }
    setState(EMPTY_WIZARD_STATE);
    setStep(1);
    setIssuedHoldId(null);
  }

  // The shell renders the current step component; each step owns
  // its onValid callback to gate the Next button.
  const stepProps = { matterId, state, update, onValid: setStepValid };

  // After issue, the wizard locks into ProgressPanel until the user
  // clicks View Hold or Cancel.
  if (issuing && issuedHoldId) {
    return (
      <ProgressPanel
        matterId={matterId}
        holdId={issuedHoldId}
        noticeTemplateId={state.noticeTemplateId ?? ""}
        recipientCustodianPersonIds={state.noticeRecipients}
        onClose={(holdId, success) => {
          if (success) {
            toast.success("Hold issued.");
            reset();
            onComplete?.(holdId);
          } else {
            toast.error("Hold encountered errors. Open it for details.");
            onComplete?.(holdId);
          }
        }}
      />
    );
  }

  return (
    <div
      style={{
        padding: 14,
        display: "grid",
        gap: 14,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: F,
        color: C.t1,
      }}
    >
      <StepIndicator current={step} />

      <Card>
        {step === 1 && <Step1Scope {...stepProps} />}
        {step === 2 && <Step2Custodians {...stepProps} />}
        {step === 3 && <Step3DataSources {...stepProps} />}
        {step === 4 && <Step4Notice {...stepProps} />}
        {step === 5 && (
          <Step5ReviewIssue
            {...stepProps}
            onIssue={(holdId) => {
              setIssuedHoldId(holdId);
              setIssuing(true);
            }}
          />
        )}
      </Card>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={ghostBtnStyle()}
        >
          Cancel
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 1 && (
            <button type="button" onClick={back} style={ghostBtnStyle()}>
              ← Back
            </button>
          )}
          {step < 5 && (
            <button
              type="button"
              onClick={next}
              disabled={!stepValid}
              style={primaryBtnStyle(!stepValid)}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// Step indicator
// ────────────────────────────────────────────────────────────────────

const StepIndicator: React.FC<{ current: WizardStep }> = ({ current }) => {
  const steps: WizardStep[] = useMemo(() => [1, 2, 3, 4, 5], []);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
        gap: 6,
        padding: "10px 4px",
      }}
    >
      {steps.map((s) => {
        const isPast = s < current;
        const isCurrent = s === current;
        return (
          <div key={s} style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: isCurrent
                  ? C.bl
                  : isPast
                    ? C.gn
                    : C.brL,
              }}
            />
            <div
              style={{
                fontSize: 10,
                fontFamily: M,
                color: isCurrent ? C.t1 : C.t3,
                letterSpacing: 0.5,
              }}
            >
              <strong style={{ color: isCurrent ? C.bl : "inherit" }}>
                {s}
              </strong>
              {" · "}
              {STEP_LABELS[s]}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// Button styles
// ────────────────────────────────────────────────────────────────────

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? C.brL : C.bl,
    border: "none",
    color: disabled ? C.t3 : C.bg,
    padding: "8px 18px",
    fontFamily: F,
    fontWeight: 700,
    fontSize: 12,
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}

function ghostBtnStyle(): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.brL}`,
    color: C.t1,
    padding: "8px 14px",
    fontFamily: F,
    fontWeight: 600,
    fontSize: 12,
    borderRadius: 4,
    cursor: "pointer",
  };
}
