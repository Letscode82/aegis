/**
 * NoticeDrillInModal — single notice with rendered body, body
 * hash, recipient list, and issued-by actor (4c.3, Item 7).
 *
 * The defensibility-evidence answer to "what exactly did the
 * custodian receive on this date." The rendered body is
 * reconstructed by the server from the template at the snapshotted
 * version with current matter/hold/org context — the recorded
 * `bodyHashAtIssuance` is the integrity anchor.
 */
import React, { useEffect, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ActorDisplay, useActorResolver } from "./ActorDisplay";
import { ModalShell } from "./ModalShell";

export interface NoticeIssuanceForViewerDTO {
  issuance: {
    id: string;
    issuedAt: string;
    issuedById: string;
    templateId: string;
    templateVersion: number;
    bodyHashAtIssuance: string;
    recipientCount: number;
  };
  template: {
    id: string;
    name: string;
    bodyMarkdown: string;
    version: number;
  };
  renderedBody: string;
  recipients: Array<{
    personId: string;
    personName: string;
    personEmail: string | null;
    deliveryEventAt: string | null;
    deliveryStatus: string;
  }>;
}

export interface NoticeDrillInModalProps {
  matterId: string;
  holdId: string;
  issuanceId: string;
  onClose: () => void;
}

export const NoticeDrillInModal: React.FC<NoticeDrillInModalProps> = ({
  matterId,
  holdId,
  issuanceId,
  onClose,
}) => {
  const [data, setData] = useState<NoticeIssuanceForViewerDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(
      `/api/matter/${matterId}/holds/${holdId}/notices/${issuanceId}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: NoticeIssuanceForViewerDTO) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId, issuanceId]);

  const actorInputs = data
    ? [{ actorId: data.issuance.issuedById, actorType: "USER" }]
    : [];
  const actorLookup = useActorResolver(matterId, holdId, actorInputs);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Notice issuance details"
      title={
        data
          ? `${data.template.name} (v${data.template.version})`
          : "Notice"
      }
      icon="📜"
      sub={
        data
          ? `Issued ${new Date(data.issuance.issuedAt).toISOString().replace("T", " ").slice(0, 16)} · ${data.issuance.recipientCount} recipient${data.issuance.recipientCount === 1 ? "" : "s"}`
          : undefined
      }
      maxWidth={760}
    >
      {error && (
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
      )}
      {!data && !error && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
          Loading…
        </div>
      )}
      {data && (
        <div style={{ display: "grid", gap: 14 }}>
          <Section label="Issued by">
            <ActorDisplay
              actorId={data.issuance.issuedById}
              actorType="USER"
              lookup={actorLookup}
            />
          </Section>

          <Section label="Body hash (at issuance)">
            <span
              style={{
                fontFamily: M,
                fontSize: 10,
                color: C.t1,
                background: C.s1,
                border: `1px solid ${C.br}`,
                padding: "3px 8px",
                borderRadius: 3,
                wordBreak: "break-all",
              }}
              title={data.issuance.bodyHashAtIssuance}
            >
              {data.issuance.bodyHashAtIssuance}
            </span>
          </Section>

          <div>
            <div
              style={{
                fontFamily: M,
                fontSize: 9.5,
                color: C.t3,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Rendered body
            </div>
            <pre
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                borderRadius: 4,
                padding: 12,
                fontFamily: M,
                fontSize: 11,
                lineHeight: 1.5,
                color: C.t1,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {data.renderedBody}
            </pre>
          </div>

          <div>
            <div
              style={{
                fontFamily: M,
                fontSize: 9.5,
                color: C.t3,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Recipients ({data.recipients.length})
            </div>
            <div
              style={{
                border: `1px solid ${C.br}`,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              {data.recipients.map((r) => (
                <div
                  key={r.personId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 200px 110px 110px",
                    gap: 8,
                    padding: "5px 10px",
                    fontSize: 11,
                    fontFamily: F,
                    color: C.t1,
                    borderBottom: `1px solid ${C.br}22`,
                    alignItems: "center",
                  }}
                >
                  <span>{r.personName}</span>
                  <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                    {r.personEmail ?? "—"}
                  </span>
                  <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                    {r.deliveryEventAt
                      ? new Date(r.deliveryEventAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)
                      : "—"}
                  </span>
                  <span
                    style={{
                      fontFamily: M,
                      fontSize: 9.5,
                      color: C.gn,
                      letterSpacing: 0.4,
                      textAlign: "right",
                    }}
                  >
                    {r.deliveryStatus}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 9.5,
                color: C.t4,
                fontFamily: M,
                fontStyle: "italic",
              }}
            >
              Delivery status reads {`"Recorded"`} — the issuance + chain rows
              ARE the defensibility evidence today; SES/Outlook send
              integration is a separate surface (sunset documented).
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

const Section: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      gap: 10,
      padding: "5px 0",
      borderBottom: `1px solid ${C.br}22`,
      alignItems: "center",
    }}
  >
    <span
      style={{
        fontFamily: M,
        fontSize: 9.5,
        color: C.t3,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
    <span style={{ fontSize: 11, fontFamily: F, color: C.t1 }}>{children}</span>
  </div>
);
