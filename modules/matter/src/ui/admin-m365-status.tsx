/**
 * AdminM365Status — connection status surface for /admin/m365.
 *
 * Polls /api/admin/m365/sync-status on mount and on demand. The
 * "Verify now" button calls /api/admin/m365/verify-credentials which
 * round-trips Graph /organization and updates lastVerifiedAt on the
 * row. The page renders inside the Aurora shell with the same
 * eyebrow + serif title pattern as the other admin views.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";

interface SyncStatus {
  organizationId: string;
  mode: "real" | "mock";
  configured: boolean;
  tenantIdMasked: string | null;
  lastVerifiedAt: string | null;
  lastErrorMessage: string | null;
  source: "per-org" | "env" | null;
}

interface VerifyResult {
  ok: boolean;
  durationMs: number;
  tenantId: string | null;
  error: { name: string; message: string } | null;
}

export const AdminM365Status: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/m365/sync-status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as SyncStatus;
      setStatus(j);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function verifyNow() {
    setVerifying(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/m365/verify-credentials");
      const j = (await r.json()) as VerifyResult;
      setVerifyResult(j);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14, fontFamily: F, color: C.t1 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SH
            icon="◉"
            title="Microsoft 365 connection"
            sub={status ? sourceCaption(status) : "Loading…"}
          />
          {status?.configured && (
            <button
              type="button"
              onClick={verifyNow}
              disabled={verifying}
              style={{
                background: C.bl,
                border: "none",
                color: C.bg,
                padding: "6px 14px",
                borderRadius: 4,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {verifying ? "Verifying…" : "Verify now"}
            </button>
          )}
        </div>

        {!status && (
          <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>
        )}
        {status && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 6,
              marginTop: 14,
              fontSize: 11,
            }}
          >
            <Cell label="Mode">
              <Pill
                t={status.mode === "real" ? "REAL GRAPH" : "MOCK FALLBACK"}
                c={status.mode === "real" ? C.gn : C.am}
              />
            </Cell>
            <Cell label="Source">
              {status.source === "per-org"
                ? "Per-organization credentials row"
                : status.source === "env"
                  ? "Process env vars (M365_TENANT_ID / M365_CLIENT_ID / M365_CLIENT_SECRET)"
                  : "No credentials resolved — using mock"}
            </Cell>
            <Cell label="Tenant id">
              <span style={{ fontFamily: M }}>
                {status.tenantIdMasked ?? "—"}
              </span>
            </Cell>
            <Cell label="Last verified">
              <span style={{ fontFamily: M }}>
                {status.lastVerifiedAt
                  ? new Date(status.lastVerifiedAt).toISOString().replace("T", " ").slice(0, 16)
                  : "Never"}
              </span>
            </Cell>
            {status.lastErrorMessage && (
              <Cell label="Last error">
                <span style={{ color: C.rd, fontFamily: M, fontSize: 10.5 }}>
                  {status.lastErrorMessage}
                </span>
              </Cell>
            )}
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
              fontFamily: M,
              fontSize: 11,
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}
      </Card>

      {verifyResult && (
        <Card>
          <SH icon="✓" title="Last verify result" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 6,
              fontSize: 11,
              marginTop: 10,
            }}
          >
            <Cell label="Status">
              <Pill
                t={verifyResult.ok ? "OK" : "FAILED"}
                c={verifyResult.ok ? C.gn : C.rd}
              />
            </Cell>
            <Cell label="Round-trip">
              <span style={{ fontFamily: M }}>{verifyResult.durationMs}ms</span>
            </Cell>
            <Cell label="Tenant id">
              <span style={{ fontFamily: M }}>
                {verifyResult.tenantId ?? "—"}
              </span>
            </Cell>
            {verifyResult.error && (
              <Cell label="Error">
                <span style={{ color: C.rd, fontFamily: M, fontSize: 10.5 }}>
                  {verifyResult.error.name}: {verifyResult.error.message}
                </span>
              </Cell>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

function sourceCaption(s: SyncStatus): string {
  if (!s.configured) return "No credentials resolved — running in mock mode";
  if (s.source === "per-org") return "Connected · per-org credentials";
  if (s.source === "env") return "Connected · process env vars";
  return "Connected";
}

const Cell: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <>
    <span
      style={{
        color: C.t3,
        fontFamily: M,
        fontSize: 9.5,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
    <span style={{ color: C.t1 }}>{children}</span>
  </>
);
