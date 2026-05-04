/**
 * CustodiansPanel — dominant workspace area.
 *
 * Header: title + count + alert chips (overdue / departed /
 * AgentDecision pending hook for 4d) + `+ Add custodians`.
 * Body: list of CustodianRow, expand-in-place. Empty state with
 * the three-mode add dialog when zero custodians.
 *
 * Bulk action chip ("⚠ N overdue · Send reminders") appears when
 * any custodian is overdue. Clicking the action button stubs to
 * the existing `issueNotice` modal flow (the chip's filter
 * narrows the visible list).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, SH, Pill, C, F, M, useToast } from "@aegis/ui";
import type { HoldCustodianDTO } from "./types";
import { BulkActionToolbar } from "./BulkActionToolbar";
import { BulkMarkAcknowledgedDialog } from "./BulkMarkAcknowledgedDialog";
import { BulkReleaseDialog } from "./BulkReleaseDialog";
import { CustodianRow } from "./CustodianRow";
import { CustodianAddDialog } from "./CustodianAddDialog";
import { NoticeComposerDialog } from "./NoticeComposerDialog";

export interface CustodiansPanelProps {
  matterId: string;
  holdId: string;
  /** Permission gate — set when actor has matter:legal_hold:issue. */
  canMutate: boolean;
  /** Permission gate for bulk-release and per-custodian release. */
  canRelease: boolean;
  /** Triggered when any custodian list mutation completes. */
  onChange: () => void;
  /** Fired when the bulk "Send reminders" chip is clicked. */
  onSendReminders: (custodianPersonIds: string[]) => void;
}

export const CustodiansPanel: React.FC<CustodiansPanelProps> = ({
  matterId,
  holdId,
  canMutate,
  canRelease,
  onChange,
  onSendReminders,
}) => {
  const toast = useToast();
  const [rows, setRows] = useState<HoldCustodianDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bulk-selection + bulk-action state.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkAckOpen, setBulkAckOpen] = useState(false);
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/custodians`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: HoldCustodianDTO[]) => alive && setRows(d))
      .catch((e) => alive && (setError(String(e)), setRows([])));
    return () => {
      alive = false;
    };
  }, [matterId, holdId, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
    onChange();
  }

  const overdueIds = useMemo(() => {
    if (!rows) return [] as string[];
    return rows
      .filter(
        (c) =>
          !c.releasedAt &&
          c.nextReAttestationDueAt &&
          new Date(c.nextReAttestationDueAt).getTime() < Date.now(),
      )
      .map((c) => c.personId);
  }, [rows]);

  const departedCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((c) => c.departureRecordedAt).length;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    if (!filterOverdue) return rows;
    return rows.filter((c) => overdueIds.includes(c.personId));
  }, [rows, filterOverdue, overdueIds]);

  function nameFor(personId: string): string {
    return rows?.find((c) => c.personId === personId)?.personName ?? personId;
  }

  async function reAttest(personId: string) {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/${personId}/acknowledge`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success(`Re-attestation request sent to ${nameFor(personId)}.`);
      reload();
    } catch (e) {
      toast.error(`Re-attest failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function release(personId: string) {
    const reason = window.prompt("Release reason:");
    if (!reason) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/matter/${matterId}/holds/${holdId}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ releaseReason: reason, custodianPersonId: personId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success(
        `${nameFor(personId)} released from hold (reason: ${reason.slice(0, 60)}${reason.length > 60 ? "…" : ""}).`,
      );
      reload();
    } catch (e) {
      toast.error(`Release failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function applyPreservation(personId: string, dataSourceId: string) {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/${personId}/data-sources/${dataSourceId}/apply-preservation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reasonCode: "manual_apply" }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success(`Preservation marked applied for ${nameFor(personId)}.`);
      reload();
    } catch (e) {
      toast.error(`Apply preservation failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Generates the custodian-side acknowledgment URL and copies it
   * to the clipboard. The URL points at the existing 4b
   * `/custodian/holds/[holdId]/acknowledge` page; the page
   * resolves the current user's matterId + personId via the
   * existing `/api/custodian/hold-context` endpoint.
   *
   * 4c.3 surfaces the affordance with a basic shareable URL. A
   * follow-up will add HMAC-signed tokens (see notice-link.ts —
   * scaffolded but not yet exposed) so the link can be shared with
   * a custodian who isn't yet logged in. The current URL still
   * works for any logged-in custodian on this hold.
   */
  async function copyAckLink(personId: string, personName: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/custodian/holds/${holdId}/acknowledge`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success(
          `Copied acknowledgment link for ${personName}.`,
        );
      } else {
        toast.info(`URL: ${url}`);
      }
    } catch (e) {
      toast.error(`Clipboard write failed: ${String(e)}`);
    }
  }

  async function confirmPreservation(personId: string, dataSourceId: string) {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/${personId}/data-sources/${dataSourceId}/confirm-preservation`,
        { method: "POST" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success(`Preservation confirmed for ${nameFor(personId)}.`);
      reload();
    } catch (e) {
      toast.error(`Confirm preservation failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SH icon="👥" title="Custodians" />
          <span
            style={{
              fontFamily: M,
              fontSize: 11,
              color: C.t3,
              letterSpacing: 0.4,
            }}
          >
            {rows?.length ?? 0} on the hold
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {overdueIds.length > 0 && (
            <ChipAction
              color={C.rd}
              label={`⚠ ${overdueIds.length} overdue acknowledgment${overdueIds.length === 1 ? "" : "s"}`}
              actionLabel={filterOverdue ? "Show all" : "Send reminders"}
              onClick={() => {
                if (!filterOverdue) {
                  setFilterOverdue(true);
                  onSendReminders(overdueIds);
                } else {
                  setFilterOverdue(false);
                }
              }}
            />
          )}
          {departedCount > 0 && (
            <ChipAction
              color={C.am}
              label={`${departedCount} departed custodian${departedCount === 1 ? "" : "s"}`}
            />
          )}
          {/* AgentDecision chip — never visible in 4c.2 because the
              table is empty until 4d. The wiring is laid for later. */}
          <AgentDecisionChip holdId={holdId} />
          {canMutate && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                background: C.bl,
                border: "none",
                color: C.bg,
                padding: "6px 14px",
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                borderRadius: 4,
                cursor: "pointer",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              + Add custodians
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            color: C.rd,
            fontSize: 11,
            fontFamily: M,
            marginTop: 8,
          }}
        >
          {error}
        </div>
      )}

      {!rows && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 14 }}>
          Loading custodians…
        </div>
      )}

      {rows && rows.length === 0 && (
        <EmptyState
          canMutate={canMutate}
          onAdd={() => setAdding(true)}
        />
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <BulkActionToolbar
            count={selectedIds.size}
            alreadyAckedCount={
              rows.filter(
                (c) => selectedIds.has(c.personId) && !!c.acknowledgedAt,
              ).length
            }
            alreadyReleasedCount={
              rows.filter(
                (c) => selectedIds.has(c.personId) && !!c.releasedAt,
              ).length
            }
            canIssue={canMutate}
            canRelease={canRelease}
            onClearSelection={() => setSelectedIds(new Set())}
            onSendReminder={() => setBulkSendOpen(true)}
            onMarkAck={() => setBulkAckOpen(true)}
            onRelease={() => setBulkReleaseOpen(true)}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "32px 20px 1.6fr 130px 110px 130px 90px",
              gap: 10,
              padding: "6px 10px",
              fontSize: 9.5,
              fontWeight: 600,
              color: C.t3,
              background: C.s1,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontFamily: F,
              borderBottom: `1px solid ${C.br}33`,
              alignItems: "center",
            }}
          >
            <span>
              <input
                type="checkbox"
                aria-label="Select all custodians"
                checked={
                  visibleRows.length > 0 &&
                  visibleRows.every((c) => selectedIds.has(c.personId))
                }
                onChange={(e) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) {
                      visibleRows.forEach((c) => next.add(c.personId));
                    } else {
                      visibleRows.forEach((c) => next.delete(c.personId));
                    }
                    return next;
                  });
                }}
              />
            </span>
            <span aria-hidden="true"></span>
            <span>Person</span>
            <span>Status</span>
            <span>Acknowledged</span>
            <span>Sources</span>
            <span style={{ textAlign: "right" }}>Last</span>
          </div>
          {visibleRows.length === 0 && filterOverdue && (
            <div style={{ padding: 12, color: C.t3, fontSize: 11, fontFamily: M }}>
              No overdue custodians. <span
                onClick={() => setFilterOverdue(false)}
                style={{ color: C.bl, cursor: "pointer" }}
                role="button"
                tabIndex={0}
              >
                Show all
              </span>
            </div>
          )}
          {visibleRows.map((c) => (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr",
                alignItems: "stretch",
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 11,
                  cursor: "pointer",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${c.personName}`}
                  checked={selectedIds.has(c.personId)}
                  onChange={() =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.personId)) next.delete(c.personId);
                      else next.add(c.personId);
                      return next;
                    })
                  }
                />
              </label>
              <CustodianRow
                matterId={matterId}
                holdId={holdId}
                custodian={c}
                preservedSourceCount={c.dataSources.filter(
                  (d) => !!d.preservationConfirmedAt,
                ).length}
                canMutate={canMutate}
                busy={busy}
                onReAttest={() => reAttest(c.personId)}
                onRelease={() => release(c.personId)}
                onApplyPreservation={(dsId) => applyPreservation(c.personId, dsId)}
                onConfirmPreservation={(dsId) =>
                  confirmPreservation(c.personId, dsId)
                }
                onDataSourceAdded={() => {
                  toast.success(`Data source added to ${c.personName}.`);
                  reload();
                }}
                onMarkedAcknowledged={() => {
                  toast.success(`${c.personName} marked acknowledged on behalf.`);
                  reload();
                }}
                onCopyAckLink={() => copyAckLink(c.personId, c.personName)}
              />
            </div>
          ))}
        </div>
      )}

      {adding && rows && (
        <CustodianAddDialog
          matterId={matterId}
          holdId={holdId}
          existingPersonIds={new Set(rows.map((r) => r.personId))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      )}

      {bulkSendOpen && rows && (
        <NoticeComposerDialog
          matterId={matterId}
          holdId={holdId}
          initialRecipientPersonIds={Array.from(selectedIds)}
          onClose={() => setBulkSendOpen(false)}
          onIssued={(result) => {
            setBulkSendOpen(false);
            setSelectedIds(new Set());
            toast.success(
              `Reminder sent to ${result.recipientCount} custodian${result.recipientCount === 1 ? "" : "s"}.`,
            );
            reload();
          }}
        />
      )}

      {bulkAckOpen && rows && (
        <BulkMarkAcknowledgedDialog
          matterId={matterId}
          holdId={holdId}
          custodians={rows
            .filter(
              (c) =>
                selectedIds.has(c.personId) &&
                !c.acknowledgedAt &&
                !c.releasedAt,
            )
            .map((c) => ({ personId: c.personId, personName: c.personName }))}
          onClose={() => setBulkAckOpen(false)}
          onApplied={(succeeded) => {
            setBulkAckOpen(false);
            setSelectedIds(new Set());
            toast.success(
              `Bulk action completed: ${succeeded} custodian${succeeded === 1 ? "" : "s"} marked acknowledged.`,
            );
            reload();
          }}
        />
      )}

      {bulkReleaseOpen && rows && (
        <BulkReleaseDialog
          matterId={matterId}
          holdId={holdId}
          custodians={rows
            .filter((c) => selectedIds.has(c.personId) && !c.releasedAt)
            .map((c) => ({ personId: c.personId, personName: c.personName }))}
          onClose={() => setBulkReleaseOpen(false)}
          onApplied={(succeeded) => {
            setBulkReleaseOpen(false);
            setSelectedIds(new Set());
            toast.success(
              `Bulk action completed: ${succeeded} custodian${succeeded === 1 ? "" : "s"} released.`,
            );
            reload();
          }}
        />
      )}
    </Card>
  );
};

const ChipAction: React.FC<{
  color: string;
  label: string;
  actionLabel?: string;
  onClick?: () => void;
}> = ({ color, label, actionLabel, onClick }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 12,
      background: `${color}1f`,
      border: `1px solid ${color}`,
      fontFamily: M,
      fontSize: 10,
      color,
      letterSpacing: 0.3,
    }}
  >
    {label}
    {actionLabel && (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: color,
          color: C.bg,
          border: "none",
          padding: "2px 8px",
          borderRadius: 8,
          fontSize: 9.5,
          fontFamily: F,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {actionLabel}
      </button>
    )}
  </span>
);

/**
 * Hook for the 4d AgentDecision chip. Polls the audit log for
 * pending recommendations on this hold; stays empty in 4c.2 because
 * the AgentDecision table is empty until 4d. The wiring is in place
 * so the chip lights up automatically when 4d ships.
 */
const AgentDecisionChip: React.FC<{ holdId: string }> = ({ holdId }) => {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    // Lightweight probe — not a new endpoint; we read the chain via
    // /api/audit-log filtered by resourceId = holdId + action prefix
    // matter.legal_hold.agent.*. In 4c.2 this returns 0; in 4d the
    // resulting AgentDecision rows surface here.
    fetch(`/api/audit-log?resourceType=LegalHold&resourceId=${encodeURIComponent(holdId)}&action=agent.recommendation.pending&page=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPending(j?.total ?? 0))
      .catch(() => setPending(0));
  }, [holdId]);
  if (pending === 0) return null;
  return (
    <Pill
      t={`🤖 ${pending} AI recommendation${pending === 1 ? "" : "s"} pending`}
      c={C.pp}
    />
  );
};

const EmptyState: React.FC<{
  canMutate: boolean;
  onAdd: () => void;
}> = ({ canMutate, onAdd }) => (
  <div
    style={{
      marginTop: 14,
      padding: "32px 16px",
      border: `1px dashed ${C.br}`,
      borderRadius: 6,
      textAlign: "center",
      fontFamily: F,
      color: C.t2,
    }}
  >
    <div style={{ fontSize: 13, color: C.t1, marginBottom: 6 }}>
      No custodians on this hold yet.
    </div>
    <div style={{ fontSize: 11, color: C.t3, marginBottom: 14 }}>
      Pick from the M365 directory or the matter team to add custodians and
      enable preservation.
    </div>
    {canMutate ? (
      <button
        type="button"
        onClick={onAdd}
        style={{
          background: C.bl,
          color: C.bg,
          border: "none",
          padding: "10px 22px",
          borderRadius: 4,
          fontFamily: F,
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        + Add custodians
      </button>
    ) : (
      <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>
        Requires matter:legal_hold:issue.
      </div>
    )}
  </div>
);
