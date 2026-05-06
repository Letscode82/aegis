/**
 * Step 3 — Data Sources (sub-PR 4d.0).
 *
 * For each selected custodian, AEGIS auto-discovers their M365 data
 * sources via `POST /api/matter/[id]/holds/discover-data-sources`.
 * Each discovery card shows a per-source checkbox (all checked by
 * default) and a SharePoint picker that lists followed-sites +
 * keyword-search hits.
 *
 * Discovery is best-effort: a custodian whose discovery fails gets
 * a yellow "couldn't auto-discover" card with a "Skip — I'll add
 * sources manually" link. The wizard's tally counts only ticked
 * sources, including ticked SharePoint sites.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pill, SH, C, F, M } from "@aegis/ui";
import type {
  CustodianDiscovery,
  DiscoveredDataSource,
  DiscoveredSharePointSite,
  WizardStepProps,
} from "./types";

interface DiscoveryEntryDTO {
  personId: string;
  status: "succeeded" | "failed";
  errorMessage?: string;
  externalRef: string | null;
  sources: Array<{
    type: string;
    externalIdentifier: string;
    displayLabel: string;
    retentionPolicyConflict: boolean;
  }>;
  sharePointSites: Array<{
    webUrl: string;
    displayName: string;
    siteType: "personal" | "team" | "communication";
    estimatedSize?: string;
    recommended: boolean;
    rationale?: string;
  }>;
}

export const Step3DataSources: React.FC<WizardStepProps> = ({
  matterId,
  state,
  update,
  onValid,
}) => {
  const [discovering, setDiscovering] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Discovery should fire once per (matter, custodian set). We key on
  // the comma-separated personIds so revisiting Step 3 with the same
  // custodian set doesn't re-discover from scratch.
  const custodianKey = useMemo(
    () => state.selectedCustodians.map((c) => c.id).sort().join(","),
    [state.selectedCustodians],
  );

  const runDiscovery = useCallback(async () => {
    if (state.selectedCustodians.length === 0) return;
    setDiscovering(true);
    setGlobalError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/discover-data-sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personIds: state.selectedCustodians.map((c) => c.id),
            sharePointKeywords: [
              state.holdName,
              ...state.jurisdictions,
              ...state.scopeMarkdown
                .split(/\s+/)
                .filter((w) => w.length >= 4)
                .slice(0, 6),
            ].filter(Boolean),
          }),
        },
      );
      const body = (await r.json()) as
        | { ok: true; entries: DiscoveryEntryDTO[] }
        | { ok: false; error: { code: string; message: string } };
      if (!r.ok || body.ok === false) {
        setGlobalError(
          (body as { error?: { message?: string } }).error?.message ??
            `HTTP ${r.status}`,
        );
        return;
      }
      const next: Record<string, CustodianDiscovery> = {};
      for (const entry of body.entries) {
        next[entry.personId] = {
          personId: entry.personId,
          status: entry.status,
          errorMessage: entry.errorMessage,
          sources: entry.sources.map(
            (s): DiscoveredDataSource => ({
              type: s.type,
              externalIdentifier: s.externalIdentifier,
              displayLabel: s.displayLabel,
              retentionPolicyConflict: s.retentionPolicyConflict,
              selected: true,
            }),
          ),
          sharePointSites: entry.sharePointSites.map(
            (s): DiscoveredSharePointSite => ({
              webUrl: s.webUrl,
              displayName: s.displayName,
              siteType: s.siteType,
              estimatedSize: s.estimatedSize,
              recommended: s.recommended,
              rationale: s.rationale,
              selected: s.recommended,
            }),
          ),
        };
      }
      update({ discoveryByCustodian: next });
    } catch (e) {
      setGlobalError(String((e as Error).message ?? e));
    } finally {
      setDiscovering(false);
    }
  }, [
    matterId,
    state.selectedCustodians,
    state.holdName,
    state.jurisdictions,
    state.scopeMarkdown,
    update,
  ]);

  // Auto-discover on first entry (or when the custodian set changes).
  useEffect(() => {
    if (state.skipAutoDiscovery) return;
    if (custodianKey.length === 0) return;
    const haveAll = state.selectedCustodians.every(
      (c) => state.discoveryByCustodian[c.id],
    );
    if (haveAll) return;
    void runDiscovery();
    // We intentionally exclude state.discoveryByCustodian from deps —
    // updating it is the EFFECT of this hook, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custodianKey, state.skipAutoDiscovery]);

  // Validation: at least one source ticked across all custodians, OR
  // skip-auto-discovery flagged (manual entry will happen on the
  // workspace post-issue).
  const tally = useMemo(() => {
    let mailboxes = 0;
    let oneDrives = 0;
    let teamsChannels = 0;
    let sites = 0;
    let total = 0;
    for (const cust of state.selectedCustodians) {
      const d = state.discoveryByCustodian[cust.id];
      if (!d) continue;
      for (const s of d.sources) {
        if (!s.selected) continue;
        total += 1;
        if (s.type === "EMAIL_MAILBOX" || s.type === "ARCHIVED_MAILBOX")
          mailboxes += 1;
        else if (s.type === "ONEDRIVE") oneDrives += 1;
        else if (s.type === "TEAMS_CHANNEL" || s.type === "TEAMS_DM")
          teamsChannels += 1;
      }
      for (const s of d.sharePointSites) {
        if (s.selected) {
          sites += 1;
          total += 1;
        }
      }
    }
    return { mailboxes, oneDrives, teamsChannels, sites, total };
  }, [state.selectedCustodians, state.discoveryByCustodian]);

  useEffect(() => {
    onValid(state.skipAutoDiscovery || tally.total > 0);
  }, [state.skipAutoDiscovery, tally.total, onValid]);

  function patchDiscovery(
    personId: string,
    patch: (d: CustodianDiscovery) => CustodianDiscovery,
  ) {
    update({
      discoveryByCustodian: {
        ...state.discoveryByCustodian,
        [personId]: patch(state.discoveryByCustodian[personId]!),
      },
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <SH
          icon="🔍"
          title="Data sources"
          sub="What data should we preserve?"
        />

        {globalError && (
          <div
            style={{
              padding: 10,
              border: `1px solid ${C.am}`,
              background: C.amG,
              color: C.am,
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            Discovery error: {globalError}
          </div>
        )}

        <div>
          <label
            style={{
              fontSize: 11,
              color: C.t2,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="checkbox"
              checked={state.skipAutoDiscovery}
              onChange={(e) =>
                update({ skipAutoDiscovery: e.target.checked })
              }
            />
            Skip auto-discovery — I'll add sources manually after issue
          </label>
        </div>

        {!state.skipAutoDiscovery &&
          state.selectedCustodians.map((c) => {
            const d = state.discoveryByCustodian[c.id];
            return (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  border: `1px solid ${C.brL}`,
                  borderRadius: 4,
                  background: C.s1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {c.name}
                    </div>
                    <div
                      style={{ fontSize: 11, color: C.t3, fontFamily: M }}
                    >
                      {c.email}
                    </div>
                  </div>
                  {!d && (discovering ? (
                    <span style={{ fontSize: 11, color: C.t3 }}>
                      Discovering…
                    </span>
                  ) : null)}
                  {d?.status === "succeeded" && (
                    <Pill t="DISCOVERED" c={C.gn} />
                  )}
                  {d?.status === "failed" && (
                    <Pill t="DISCOVERY FAILED" c={C.am} />
                  )}
                </div>

                {d?.status === "failed" && (
                  <div
                    style={{
                      padding: 8,
                      background: C.amG,
                      color: C.am,
                      fontSize: 11,
                      borderRadius: 4,
                      marginTop: 6,
                    }}
                  >
                    {d.errorMessage ?? "Auto-discovery unavailable."} You
                    can add sources manually after issue.
                  </div>
                )}

                {d?.status === "succeeded" && d.sources.length === 0 && (
                  <div style={{ fontSize: 11, color: C.t3 }}>
                    No data sources detected for {c.name}.
                  </div>
                )}

                {d?.sources.map((s, idx) => (
                  <label
                    key={`${c.id}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={s.selected}
                      onChange={(e) =>
                        patchDiscovery(c.id, (prev) => ({
                          ...prev,
                          sources: prev.sources.map((x, i) =>
                            i === idx ? { ...x, selected: e.target.checked } : x,
                          ),
                        }))
                      }
                    />
                    <span style={{ flex: 1 }}>{s.displayLabel}</span>
                    <span
                      style={{ fontSize: 10, color: C.t3, fontFamily: M }}
                    >
                      {s.type}
                    </span>
                    {s.retentionPolicyConflict && (
                      <Pill t="EPHEMERAL" c={C.am} />
                    )}
                  </label>
                ))}

                {d?.sharePointSites && d.sharePointSites.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px solid ${C.brL}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: M,
                        fontSize: 10,
                        color: C.t3,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      SharePoint sites ({d.sharePointSites.length} found)
                    </div>
                    {d.sharePointSites.map((s, idx) => (
                      <label
                        key={`${c.id}-sp-${idx}`}
                        title={s.rationale}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={s.selected}
                          onChange={(e) =>
                            patchDiscovery(c.id, (prev) => ({
                              ...prev,
                              sharePointSites: prev.sharePointSites.map(
                                (x, i) =>
                                  i === idx
                                    ? { ...x, selected: e.target.checked }
                                    : x,
                              ),
                            }))
                          }
                        />
                        <span style={{ flex: 1 }}>
                          {s.displayName}
                          {s.recommended && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: C.gn,
                                fontFamily: M,
                              }}
                            >
                              ★ recommended
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: C.t3,
                            fontFamily: M,
                          }}
                        >
                          {s.siteType}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <aside
        style={{
          padding: 12,
          background: C.cd,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          alignSelf: "start",
          display: "grid",
          gap: 6,
          fontSize: 11,
          color: C.t2,
          lineHeight: 1.6,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9.5,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: C.t3,
            marginBottom: 4,
          }}
        >
          Coverage tally
        </div>
        <div>
          <strong>{state.selectedCustodians.length}</strong> custodian
          {state.selectedCustodians.length === 1 ? "" : "s"}
        </div>
        <div>
          <strong>{tally.total}</strong> data source
          {tally.total === 1 ? "" : "s"} selected
        </div>
        {tally.total > 0 && (
          <div style={{ color: C.t3, fontSize: 10.5 }}>
            {tally.mailboxes} mailbox{tally.mailboxes === 1 ? "" : "es"} ·{" "}
            {tally.oneDrives} OneDrive{tally.oneDrives === 1 ? "" : "s"} ·{" "}
            {tally.sites} SharePoint site{tally.sites === 1 ? "" : "s"} ·{" "}
            {tally.teamsChannels} Teams source
            {tally.teamsChannels === 1 ? "" : "s"}
          </div>
        )}
        {state.skipAutoDiscovery && (
          <div style={{ color: C.am, fontSize: 11 }}>
            Skipping auto-discovery; sources will be added manually
            after this hold issues.
          </div>
        )}
      </aside>
    </div>
  );
};
