/**
 * NoticeViewerModal — defensibility evidence list (4c.3, Item 7).
 * Click the Notices rail card to open this; click an issuance row
 * inside to drill into the rendered body.
 *
 * Reads from the existing /notices issuance log endpoint; drill-in
 * fetches the new /notices/[issuanceId] route which re-renders the
 * body and surfaces the recipient roster.
 */
import React, { useEffect, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";
import { NoticeDrillInModal } from "./NoticeDrillInModal";
import type { HoldNoticeIssuanceDTO } from "./types";

export interface NoticeViewerModalProps {
  matterId: string;
  holdId: string;
  onClose: () => void;
}

export const NoticeViewerModal: React.FC<NoticeViewerModalProps> = ({
  matterId,
  holdId,
  onClose,
}) => {
  const [rows, setRows] = useState<HoldNoticeIssuanceDTO[] | null>(null);
  const [drillInId, setDrillInId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/notices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: HoldNoticeIssuanceDTO[]) => alive && setRows(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId]);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Issued notices"
      title="Issued notices"
      icon="📜"
      sub="Click an issuance to drill into the rendered body, body hash, and recipient roster."
      maxWidth={760}
    >
      {error && (
        <div
          style={{
            color: C.rd,
            fontSize: 11,
            fontFamily: M,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}
      {!rows && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
          Loading…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
          No notices issued on this hold yet.
        </div>
      )}
      {rows && rows.length > 0 && (
        <div
          style={{
            border: `1px solid ${C.br}`,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "150px 1fr 80px 110px 1fr",
              gap: 8,
              padding: "6px 10px",
              fontSize: 9.5,
              fontFamily: F,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: C.t3,
              background: C.s1,
              borderBottom: `1px solid ${C.br}33`,
            }}
            aria-hidden="true"
          >
            <span>Issued</span>
            <span>Template</span>
            <span>Version</span>
            <span style={{ textAlign: "right" }}>Recipients</span>
            <span>Body hash</span>
          </div>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setDrillInId(r.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr 80px 110px 1fr",
                gap: 8,
                padding: "8px 10px",
                fontSize: 11,
                fontFamily: F,
                width: "100%",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${C.br}22`,
                color: C.t1,
                cursor: "pointer",
                textAlign: "left",
                alignItems: "center",
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                {new Date(r.issuedAt)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16)}
              </span>
              <span>{r.templateName}</span>
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                v{r.templateVersion}
              </span>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 10,
                  color: C.t1,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                {r.recipientCount}
              </span>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 9.5,
                  color: C.t4,
                }}
                title={r.bodyHashAtIssuance}
              >
                {r.bodyHashAtIssuance.slice(0, 16)}…
              </span>
            </button>
          ))}
        </div>
      )}

      {drillInId && (
        <NoticeDrillInModal
          matterId={matterId}
          holdId={holdId}
          issuanceId={drillInId}
          onClose={() => setDrillInId(null)}
        />
      )}
    </ModalShell>
  );
};
