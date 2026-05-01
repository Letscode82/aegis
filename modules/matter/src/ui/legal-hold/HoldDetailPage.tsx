/**
 * HoldDetailPage — the hub for one legal hold. Tabs:
 *   Overview      header + privilege flags + scorecard summary
 *   Custodians    list with acknowledgment + data-source counts
 *   Data Sources  flat list across all custodians
 *   Notices       issuance log with content-hash snapshots
 *   Timeline      LegalHoldEvent stream
 *   Defensibility full scorecard breakdown + gaps + export button
 *   Policy        resolved cadence + escalation chain (read-only in 4b)
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill, SH, C, F, M, SR } from "@aegis/ui";
import {
  DefensibilityBadge,
  JurisdictionPills,
  StatusPill,
  defensibilityColor,
} from "./badges";
import type {
  HoldCustodianDTO,
  HoldDataSourceDTO,
  HoldDefensibilityScoreDTO,
  HoldDetailDTO,
  HoldEventDTO,
  HoldNoticeIssuanceDTO,
} from "./types";

type TabKey =
  | "overview"
  | "custodians"
  | "data-sources"
  | "notices"
  | "timeline"
  | "defensibility";

export interface HoldDetailPageProps {
  matterId: string;
  holdId: string;
  endpoint?: string;
  onBack?: () => void;
}

export const HoldDetailPage: React.FC<HoldDetailPageProps> = ({
  matterId,
  holdId,
  endpoint = "/api/matter",
  onBack,
}) => {
  const [hold, setHold] = useState<HoldDetailDTO | null>(null);
  const [score, setScore] = useState<HoldDefensibilityScoreDTO | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `${endpoint}/${matterId}/holds/${holdId}`;

  useEffect(() => {
    let alive = true;
    fetch(baseUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: HoldDetailDTO) => alive && setHold(d))
      .catch((e) => alive && setError(String(e)));
    fetch(`${baseUrl}/scorecard`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((s: HoldDefensibilityScoreDTO) => alive && setScore(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [baseUrl]);

  if (error)
    return (
      <Card>
        <div style={{ color: C.rd, fontSize: 12, fontFamily: M }}>{error}</div>
      </Card>
    );
  if (!hold)
    return (
      <Card>
        <div style={{ color: C.t3, fontSize: 12, fontFamily: M }}>Loading…</div>
      </Card>
    );

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "custodians", label: "Custodians" },
    { key: "data-sources", label: "Data sources" },
    { key: "notices", label: "Notices" },
    { key: "timeline", label: "Timeline" },
    { key: "defensibility", label: "Defensibility" },
  ];

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            {onBack && (
              <div
                onClick={onBack}
                style={{
                  fontSize: 10,
                  color: C.t3,
                  fontFamily: M,
                  cursor: "pointer",
                  marginBottom: 6,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                ← Back to matter
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                {hold.holdNumber ?? "(draft)"}
              </span>
              <StatusPill status={hold.status} />
              <JurisdictionPills codes={hold.jurisdictions} />
            </div>
            <div style={{ fontFamily: SR, fontSize: 22, color: C.t1, lineHeight: 1.2 }}>
              {hold.title}
            </div>
            {hold.scopeDescription && (
              <div style={{ fontSize: 12, color: C.t2, marginTop: 6, maxWidth: 760 }}>
                {hold.scopeDescription}
              </div>
            )}
            {hold.privilegeFlags &&
              Object.values(hold.privilegeFlags).some(Boolean) && (
                <div style={{ marginTop: 10, fontSize: 10.5, color: C.am, fontFamily: M }}>
                  ⚠ Privilege flags:{" "}
                  {Object.entries(hold.privilegeFlags)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(", ")}
                </div>
              )}
          </div>
          {score && <DefensibilityBadge score={score.score} />}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 4 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? C.cd : "transparent",
              border: `1px solid ${tab === t.key ? C.brL : C.br}`,
              color: tab === t.key ? C.t1 : C.t3,
              padding: "6px 12px",
              borderRadius: 5,
              fontFamily: F,
              fontSize: 11,
              fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab hold={hold} score={score} />}
      {tab === "custodians" && <CustodiansTab baseUrl={baseUrl} holdStatus={hold.status} />}
      {tab === "data-sources" && <DataSourcesTab baseUrl={baseUrl} />}
      {tab === "notices" && <NoticesTab baseUrl={baseUrl} />}
      {tab === "timeline" && <TimelineTab baseUrl={baseUrl} />}
      {tab === "defensibility" && <DefensibilityTab score={score} baseUrl={baseUrl} />}
    </div>
  );
};

// ── Overview ──────────────────────────────────────────────────────

const OverviewTab: React.FC<{ hold: HoldDetailDTO; score: HoldDefensibilityScoreDTO | null }> = ({
  hold,
  score,
}) => (
  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
    <Card>
      <SH icon="📋" title="Hold details" />
      <Field label="Triggered at">
        {hold.triggeredAt ? new Date(hold.triggeredAt).toISOString().slice(0, 16).replace("T", " ") : "—"}
      </Field>
      <Field label="Trigger event">{hold.triggerEventDescription ?? "—"}</Field>
      <Field label="Issued at">
        {hold.issuedAt ? new Date(hold.issuedAt).toISOString().slice(0, 16).replace("T", " ") : "—"}
      </Field>
      <Field label="Released at">
        {hold.releasedAt ? new Date(hold.releasedAt).toISOString().slice(0, 16).replace("T", " ") : "—"}
      </Field>
      <Field label="Affects departed custodians">
        {hold.affectsDepartedCustodians ? "Yes" : "No"}
      </Field>
    </Card>
    <Card>
      <SH icon="📊" title="Scorecard summary" />
      {!score && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {score && (
        <div style={{ display: "grid", gap: 6 }}>
          {Object.entries(score.components).map(([key, c]) => (
            <ComponentBar key={key} label={key} value={c.value} weight={c.weight} gap={c.gap} />
          ))}
        </div>
      )}
    </Card>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "5px 0", borderBottom: `1px solid ${C.br}22`, fontSize: 11 }}>
    <span style={{ color: C.t3, fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
      {label}
    </span>
    <span style={{ color: C.t1, fontFamily: F }}>{children}</span>
  </div>
);

const ComponentBar: React.FC<{ label: string; value: number; weight: number; gap: string | null }> = ({
  label,
  value,
  weight,
  gap,
}) => {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.t2, fontFamily: F }}>
        <span>
          {label} <span style={{ color: C.t4, fontSize: 9 }}>· weight {weight}</span>
        </span>
        <span style={{ fontFamily: M, color: C.t1 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: C.br, borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: defensibilityColor(pct),
            transition: "width .25s",
          }}
        />
      </div>
      {gap && (
        <div style={{ fontSize: 9.5, color: C.am, fontFamily: M, marginTop: 2 }}>{gap}</div>
      )}
    </div>
  );
};

// ── Custodians ────────────────────────────────────────────────────

const CustodiansTab: React.FC<{ baseUrl: string; holdStatus: string }> = ({ baseUrl, holdStatus }) => {
  const [rows, setRows] = useState<HoldCustodianDTO[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch(`${baseUrl}/custodians`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [baseUrl, reloadKey]);

  async function acknowledge(personId: string) {
    await fetch(`${baseUrl}/custodians/${personId}/acknowledge`, { method: "POST" });
    setReloadKey((k) => k + 1);
  }

  async function release(personId: string) {
    const reason = window.prompt("Release reason:");
    if (!reason) return;
    await fetch(`${baseUrl}/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseReason: reason, custodianPersonId: personId }),
    });
    setReloadKey((k) => k + 1);
  }

  return (
    <Card>
      <SH icon="👥" title="Custodians" sub={`${rows?.length ?? 0} on the hold`} />
      {!rows && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No custodians yet.</div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {rows.map((c) => {
            const overdue =
              c.nextReAttestationDueAt &&
              !c.releasedAt &&
              new Date(c.nextReAttestationDueAt).getTime() < Date.now();
            return (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 110px 110px 110px 1fr 120px",
                  gap: 8,
                  alignItems: "center",
                  padding: "7px 8px",
                  fontSize: 11,
                  borderBottom: `1px solid ${C.br}22`,
                  fontFamily: F,
                }}
              >
                <div>
                  <div style={{ color: C.t1 }}>{c.personName}</div>
                  <div style={{ fontFamily: M, color: C.t3, fontSize: 10 }}>
                    {c.personEmail ?? ""}
                  </div>
                </div>
                <div>
                  {c.releasedAt ? (
                    <Pill t="released" c={C.t4} />
                  ) : c.acknowledgedAt ? (
                    <Pill t="acknowledged" c={C.gn} />
                  ) : (
                    <Pill t="pending" c={C.am} />
                  )}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                  {c.acknowledgedAt
                    ? new Date(c.acknowledgedAt).toISOString().slice(0, 10)
                    : "—"}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: overdue ? C.rd : C.t3 }}>
                  {c.nextReAttestationDueAt
                    ? `${overdue ? "⚠ overdue " : ""}${new Date(c.nextReAttestationDueAt).toISOString().slice(0, 10)}`
                    : "—"}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: C.t4 }}>
                  {c.dataSources.length} data source
                  {c.dataSources.length === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {!c.acknowledgedAt && !c.releasedAt && (
                    <button
                      type="button"
                      onClick={() => acknowledge(c.personId)}
                      style={miniBtn(C.gn)}
                    >
                      Ack (admin)
                    </button>
                  )}
                  {!c.releasedAt && holdStatus !== "RELEASED" && (
                    <button
                      type="button"
                      onClick={() => release(c.personId)}
                      style={miniBtn(C.rd)}
                    >
                      Release
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

function miniBtn(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}55`,
    color,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontFamily: F,
    cursor: "pointer",
    letterSpacing: 0.3,
  };
}

// ── Data sources ──────────────────────────────────────────────────

const DataSourcesTab: React.FC<{ baseUrl: string }> = ({ baseUrl }) => {
  const [rows, setRows] = useState<Array<HoldCustodianDTO & { dataSources: HoldDataSourceDTO[] }> | null>(null);
  useEffect(() => {
    fetch(`${baseUrl}/custodians`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [baseUrl]);

  const flat = useMemo(() => {
    if (!rows) return [];
    return rows.flatMap((c) =>
      c.dataSources.map((d) => ({ ...d, custodian: c.personName })),
    );
  }, [rows]);

  return (
    <Card>
      <SH icon="📦" title="Data sources" sub={`${flat.length} across all custodians`} />
      {!rows && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {rows && flat.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No data sources yet.</div>
      )}
      {flat.length > 0 && (
        <div style={{ display: "grid", gap: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.5fr 160px 160px 110px 80px",
              padding: "7px 10px",
              fontSize: 9.5,
              fontWeight: 600,
              color: C.t3,
              background: C.s1,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontFamily: F,
              borderBottom: `1px solid ${C.br}22`,
            }}
          >
            <div>Custodian</div>
            <div>Source</div>
            <div>Type</div>
            <div>Action</div>
            <div>Confirmed</div>
            <div>Conflict</div>
          </div>
          {flat.map((d) => (
            <div
              key={d.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.5fr 160px 160px 110px 80px",
                padding: "5px 10px",
                fontSize: 10.5,
                fontFamily: F,
                color: C.t1,
                borderBottom: `1px solid ${C.br}22`,
                alignItems: "center",
              }}
            >
              <div>{d.custodian}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.displayLabel}
              </div>
              <div style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>{d.type}</div>
              <div style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
                {d.preservationAction}
              </div>
              <div style={{ fontFamily: M, fontSize: 9.5, color: d.preservationConfirmedAt ? C.gn : C.am }}>
                {d.preservationConfirmedAt
                  ? new Date(d.preservationConfirmedAt).toISOString().slice(0, 10)
                  : "pending"}
              </div>
              <div>
                {d.retentionPolicyConflict ? (
                  <Pill t="conflict" c={C.rd} />
                ) : (
                  <span style={{ color: C.t4, fontSize: 10, fontFamily: M }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Notices ───────────────────────────────────────────────────────

const NoticesTab: React.FC<{ baseUrl: string }> = ({ baseUrl }) => {
  const [rows, setRows] = useState<HoldNoticeIssuanceDTO[] | null>(null);
  useEffect(() => {
    fetch(`${baseUrl}/notices`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [baseUrl]);
  return (
    <Card>
      <SH icon="📜" title="Notice issuance log" />
      {!rows && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No notices issued yet.</div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px 1fr 130px",
                gap: 8,
                fontSize: 10.5,
                fontFamily: F,
                padding: "5px 6px",
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <span>{r.templateName}</span>
              <span style={{ fontFamily: M, color: C.t3 }}>v{r.templateVersion}</span>
              <span style={{ fontFamily: M, color: C.t3 }}>
                {r.recipientCount} recipients
              </span>
              <span style={{ fontFamily: M, color: C.t4, fontSize: 9.5 }}>
                {r.bodyHashAtIssuance.slice(0, 16)}…
              </span>
              <span style={{ fontFamily: M, color: C.t3 }}>
                {new Date(r.issuedAt).toISOString().replace("T", " ").slice(0, 16)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Timeline ──────────────────────────────────────────────────────

const TimelineTab: React.FC<{ baseUrl: string }> = ({ baseUrl }) => {
  const [rows, setRows] = useState<HoldEventDTO[] | null>(null);
  useEffect(() => {
    fetch(`${baseUrl}/timeline`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [baseUrl]);
  return (
    <Card>
      <SH icon="🕒" title="Timeline" sub="Twin-recorded with the chain-sealed AuditLog" />
      {!rows && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11 }}>No events.</div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((e) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 220px 1fr 120px",
                gap: 8,
                padding: "5px 6px",
                fontSize: 11,
                fontFamily: F,
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                {new Date(e.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: C.tl }}>{e.type}</span>
              <span>{e.summary}</span>
              <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>
                {e.actorType}:{e.actorId?.slice(0, 8) ?? "—"}…
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Defensibility ─────────────────────────────────────────────────

const DefensibilityTab: React.FC<{ score: HoldDefensibilityScoreDTO | null; baseUrl: string }> = ({ score, baseUrl }) => {
  if (!score) return <Card><div style={{ color: C.t3, fontSize: 11 }}>Loading…</div></Card>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH icon="📊" title="Defensibility scorecard" sub={`Computed ${new Date(score.computedAt).toISOString().slice(0, 16).replace("T", " ")}`} />
          <a
            href={`${baseUrl}/export`}
            style={{
              background: C.bl,
              color: C.bg,
              fontFamily: F,
              fontWeight: 700,
              fontSize: 11,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Export defensibility (JSON)
          </a>
        </div>
        <div style={{ marginTop: 12 }}>
          <DefensibilityBadge score={score.score} />
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
          {Object.entries(score.components).map(([key, c]) => (
            <ComponentBar key={key} label={key} value={c.value} weight={c.weight} gap={c.gap} />
          ))}
        </div>
      </Card>
      {score.gaps.length > 0 && (
        <Card>
          <SH icon="⚠" title="Gaps" sub={`${score.gaps.length} issue${score.gaps.length === 1 ? "" : "s"}`} />
          <div style={{ display: "grid", gap: 6 }}>
            {score.gaps.map((g) => (
              <div
                key={g.key + g.message}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr 60px",
                  fontSize: 11,
                  fontFamily: F,
                  padding: "4px 6px",
                  borderBottom: `1px solid ${C.br}22`,
                  alignItems: "center",
                }}
              >
                <Pill t={g.severity} c={g.severity === "high" ? C.rd : g.severity === "medium" ? C.am : C.t3} />
                <span style={{ color: C.t1 }}>{g.message}</span>
                <span style={{ fontFamily: M, fontSize: 10, color: C.t3, textAlign: "right" }}>
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
