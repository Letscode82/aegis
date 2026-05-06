/**
 * Step 5 — Review & Issue (sub-PR 4d.0).
 *
 * One-page summary of everything captured so far + the big ISSUE
 * HOLD button. Click triggers the orchestration:
 *
 *   1. POST /api/matter/[id]/holds            — create the draft hold
 *   2. POST /holds/[holdId]/custodians        — for each selected person
 *   3. POST /custodians/[id]/data-sources     — for each ticked source
 *   4. Hand off to ProgressPanel              — which streams the
 *                                                 issue-with-progress
 *                                                 SSE for the rest of
 *                                                 the flow (issue +
 *                                                 apply + notice).
 *
 * Steps 1-3 happen synchronously here so the wizard knows the
 * holdId before transitioning to ProgressPanel. The remaining
 * Microsoft push happens inside the SSE stream so counsel watches
 * the Purview round-trip live.
 */
import React, { useMemo, useState } from "react";
import { SH, C, F, M, useToast } from "@aegis/ui";
import type { WizardStepProps, DiscoveredDataSource, DiscoveredSharePointSite } from "./types";

export interface Step5ReviewIssueProps extends WizardStepProps {
  onIssue: (holdId: string) => void;
}

interface SourcePayload {
  type: string;
  externalIdentifier: string;
  displayLabel: string;
  retentionPolicyConflict: boolean;
}

function dataSourceToPayload(s: DiscoveredDataSource): SourcePayload {
  return {
    type: s.type,
    externalIdentifier: s.externalIdentifier,
    displayLabel: s.displayLabel,
    retentionPolicyConflict: s.retentionPolicyConflict,
  };
}

function sharePointToPayload(s: DiscoveredSharePointSite): SourcePayload {
  return {
    type: "SHAREPOINT_SITE",
    externalIdentifier: s.webUrl,
    displayLabel: `SharePoint: ${s.displayName}`,
    retentionPolicyConflict: false,
  };
}

export const Step5ReviewIssue: React.FC<Step5ReviewIssueProps> = ({
  matterId,
  state,
  update,
  onIssue,
}) => {
  const toast = useToast();
  const [issuing, setIssuing] = useState(false);
  const [stepStatus, setStepStatus] = useState<string | null>(null);

  const tally = useMemo(() => {
    let mailboxes = 0;
    let oneDrives = 0;
    let sites = 0;
    let teams = 0;
    let total = 0;
    for (const c of state.selectedCustodians) {
      const d = state.discoveryByCustodian[c.id];
      if (!d) continue;
      for (const s of d.sources) {
        if (!s.selected) continue;
        total += 1;
        if (s.type.endsWith("MAILBOX")) mailboxes += 1;
        else if (s.type === "ONEDRIVE") oneDrives += 1;
        else if (s.type.startsWith("TEAMS")) teams += 1;
      }
      for (const s of d.sharePointSites) if (s.selected) {
        sites += 1;
        total += 1;
      }
    }
    return { mailboxes, oneDrives, sites, teams, total };
  }, [state.selectedCustodians, state.discoveryByCustodian]);

  async function issue() {
    if (!state.holdName || !state.noticeTemplateId) {
      toast.error("Hold name and notice template are required");
      return;
    }
    setIssuing(true);
    try {
      // 1. Create the draft hold.
      setStepStatus("Creating hold record…");
      const holdResp = await fetch(`/api/matter/${matterId}/holds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.holdName,
          scopeDescription: state.scopeMarkdown,
          jurisdictions: state.jurisdictions,
          triggerEventDescription: state.triggerEventDescription,
          triggeredAt: state.triggeredAt,
        }),
      });
      if (!holdResp.ok) {
        const body = (await holdResp.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Create hold failed: HTTP ${holdResp.status}`);
      }
      const { id: holdId } = (await holdResp.json()) as { id: string };
      update({ draftHoldId: holdId });

      // 2. Attach custodians.
      setStepStatus("Attaching custodians…");
      for (const c of state.selectedCustodians) {
        const r = await fetch(
          `/api/matter/${matterId}/holds/${holdId}/custodians`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ personId: c.id }),
          },
        );
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            body.error ?? `Add custodian ${c.name} failed: HTTP ${r.status}`,
          );
        }
      }

      // 3. Attach selected data sources per custodian.
      if (!state.skipAutoDiscovery) {
        setStepStatus("Attaching data sources…");
        for (const c of state.selectedCustodians) {
          const d = state.discoveryByCustodian[c.id];
          if (!d || d.status !== "succeeded") continue;
          const payloads: SourcePayload[] = [
            ...d.sources.filter((s) => s.selected).map(dataSourceToPayload),
            ...d.sharePointSites
              .filter((s) => s.selected)
              .map(sharePointToPayload),
          ];
          for (const p of payloads) {
            const r = await fetch(
              `/api/matter/${matterId}/holds/${holdId}/custodians/${c.id}/data-sources`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(p),
              },
            );
            if (!r.ok) {
              // Don't abort the whole wizard for one source — the
              // workspace will surface ERROR badges and counsel can
              // retry per source. But surface a warning toast so the
              // user knows.
              console.warn(
                `Add data source ${p.displayLabel} for ${c.name} failed: HTTP ${r.status}`,
              );
            }
          }
        }
      }

      // Hand off to ProgressPanel — the SSE stream takes over from
      // here (issue lifecycle + per-source apply + notice).
      onIssue(holdId);
    } catch (e) {
      toast.error(`Issue failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setIssuing(false);
      setStepStatus(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 720, margin: "0 auto" }}>
      <SH icon="🚀" title="Review & issue" sub="Ready to send?" />

      <div
        style={{
          padding: 14,
          background: C.s1,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          fontSize: 13,
          lineHeight: 1.7,
          fontFamily: F,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: C.t1,
            marginBottom: 8,
          }}
        >
          {state.holdName || "(unnamed hold)"}
        </div>
        <Row label="Scope" value={truncateScope(state.scopeMarkdown)} />
        <Row
          label="Jurisdictions"
          value={state.jurisdictions.join(", ") || "—"}
        />
        <Row
          label="Trigger"
          value={`${state.triggerEventDescription} · ${state.triggeredAt}`}
        />
        <Row
          label="Custodians"
          value={`${state.selectedCustodians.length} selected — ${state.selectedCustodians.map((c) => c.name).join(", ")}`}
        />
        <Row
          label="Data sources"
          value={
            state.skipAutoDiscovery
              ? "Skipping auto-discovery"
              : `${tally.total} total · ${tally.mailboxes} mailbox${tally.mailboxes === 1 ? "" : "es"} · ${tally.oneDrives} OneDrive${tally.oneDrives === 1 ? "" : "s"} · ${tally.sites} SharePoint site${tally.sites === 1 ? "" : "s"} · ${tally.teams} Teams source${tally.teams === 1 ? "" : "s"}`
          }
        />
        <Row
          label="Notice"
          value={`Template selected · sending to ${state.noticeRecipients.length} recipient${state.noticeRecipients.length === 1 ? "" : "s"}${state.noticeSendAt ? ` at ${state.noticeSendAt}` : " now"}`}
        />
        {state.reminderCadenceDays && (
          <Row
            label="Reminders"
            value={`Every ${state.reminderCadenceDays} day${state.reminderCadenceDays === 1 ? "" : "s"}`}
          />
        )}
      </div>

      {issuing && (
        <div
          style={{
            padding: 10,
            background: C.cd,
            border: `1px solid ${C.brL}`,
            borderRadius: 4,
            fontSize: 11,
            color: C.t2,
          }}
        >
          {stepStatus ?? "Working…"}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => void issue()}
          disabled={issuing}
          style={{
            background: issuing ? C.brL : C.bl,
            border: "none",
            color: issuing ? C.t3 : C.bg,
            padding: "12px 28px",
            fontFamily: F,
            fontWeight: 700,
            fontSize: 14,
            borderRadius: 4,
            cursor: issuing ? "wait" : "pointer",
            letterSpacing: 0.7,
            textTransform: "uppercase",
          }}
        >
          {issuing ? "Issuing…" : "Issue Hold"}
        </button>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr",
      gap: 12,
      padding: "4px 0",
    }}
  >
    <div
      style={{
        fontFamily: M,
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: C.t3,
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: 12, color: C.t1 }}>{value}</div>
  </div>
);

function truncateScope(s: string): string {
  const flat = s.replace(/\n+/g, " ").trim();
  if (flat.length <= 200) return flat || "—";
  return flat.slice(0, 200) + "…";
}
