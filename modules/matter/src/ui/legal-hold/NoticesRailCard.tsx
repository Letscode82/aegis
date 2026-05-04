/**
 * NoticesRailCard — count + last issuance + "+ Issue notice"
 * button. Issuing now opens the 4-step `NoticeComposerDialog`
 * (4c.3) — the old single-input "Paste a template id…" dialog
 * has been removed.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import { NoticeComposerDialog } from "./NoticeComposerDialog";
import type { HoldNoticeIssuanceDTO } from "./types";

export interface NoticesRailCardProps {
  matterId: string;
  holdId: string;
  /** Set when actor has matter:legal_hold:issue. */
  canMutate: boolean;
  /** Optional click handler — when provided, the card surface is
   *  clickable and opens the notice viewer (Commit 5 wires this). */
  onOpenViewer?: () => void;
}

export const NoticesRailCard: React.FC<NoticesRailCardProps> = ({
  matterId,
  holdId,
  canMutate,
  onOpenViewer,
}) => {
  const [rows, setRows] = useState<HoldNoticeIssuanceDTO[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/notices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(() => setRows([]));
  }, [matterId, holdId, reloadKey]);

  const last = rows && rows.length > 0 ? rows[0] : null;
  const hasNotices = !!rows && rows.length > 0;

  return (
    <Card onClick={hasNotices && onOpenViewer ? onOpenViewer : undefined}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <SH icon="📜" title="Notices" />
        <span style={{ fontFamily: M, fontSize: 9, color: C.t4, letterSpacing: 0.4 }}>
          {rows?.length ?? 0} ISSUED
        </span>
      </div>

      {!rows && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          Loading…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          No notices issued yet.
        </div>
      )}
      {last && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: C.s1,
            border: `1px solid ${C.br}33`,
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            color: C.t2,
          }}
        >
          <div style={{ color: C.t1, marginBottom: 2 }}>{last.templateName}</div>
          <div style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
            v{last.templateVersion} · {last.recipientCount} recipient
            {last.recipientCount === 1 ? "" : "s"}
          </div>
          <div style={{ fontFamily: M, fontSize: 9, color: C.t4, marginTop: 4 }}>
            Issued {new Date(last.issuedAt).toISOString().replace("T", " ").slice(0, 16)}
          </div>
          <div style={{ fontFamily: M, fontSize: 9, color: C.t4, marginTop: 2 }}>
            Hash {last.bodyHashAtIssuance.slice(0, 16)}…
          </div>
        </div>
      )}

      {canMutate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setComposerOpen(true);
          }}
          style={{
            background: C.bl,
            color: C.bg,
            border: "none",
            padding: "6px 12px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginTop: 10,
            width: "100%",
          }}
        >
          + Issue notice
        </button>
      )}

      {hasNotices && onOpenViewer && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer();
          }}
          aria-label="View all issued notices"
          style={{
            marginTop: 8,
            padding: "5px 0 0",
            borderTop: `1px solid ${C.br}33`,
            fontFamily: M,
            fontSize: 9.5,
            color: C.t3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            textAlign: "center",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          View all {rows.length} →
        </button>
      )}

      {toast && (
        <div
          style={{
            marginTop: 8,
            padding: "5px 8px",
            background: `${C.gn}15`,
            border: `1px solid ${C.gn}55`,
            borderRadius: 4,
            color: C.gn,
            fontFamily: M,
            fontSize: 10,
            letterSpacing: 0.3,
          }}
        >
          {toast}
        </div>
      )}

      {composerOpen && (
        <NoticeComposerDialog
          matterId={matterId}
          holdId={holdId}
          onClose={() => setComposerOpen(false)}
          onIssued={(result) => {
            setComposerOpen(false);
            setReloadKey((k) => k + 1);
            setToast(
              `Notice sent to ${result.recipientCount} custodian${result.recipientCount === 1 ? "" : "s"}.`,
            );
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}
    </Card>
  );
};
