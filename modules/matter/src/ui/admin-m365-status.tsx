/**
 * AdminM365Status — connection status surface for /admin/m365.
 *
 * Two cards:
 *   1. App-only (M365 client-credentials) — existing connection,
 *      "Verify now" button calls /api/admin/m365/verify-credentials.
 *   2. Delegated (eDiscovery service-account) — sub-PR 4c.1.
 *      "Connect (Device Code)" / "Test eDiscovery" / "Re-authorize"
 *      / "Disconnect". Required for applyPreservation,
 *      releasePreservation, preserveDepartedMailbox.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, Pill, SH, C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./legal-hold/ModalShell";

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

interface DelegatedStatus {
  configured: boolean;
  accountUpn: string | null;
  authorizedAt: string | null;
  authorizedByName: string | null;
  authorizedById: string | null;
  tokenExpiresAt: string | null;
  lastRefreshedAt: string | null;
  lastRefreshError: string | null;
  scopesGranted: string[];
  expired: boolean;
}

interface InitiateResult {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  message: string;
}

interface PollResult {
  status: "pending" | "connected" | "expired" | "error";
  accountUpn: string | null;
  scopesGranted: string[];
  error: { code: string; message: string } | null;
}

export const AdminM365Status: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [delegated, setDelegated] = useState<DelegatedStatus | null>(null);
  const [connectModal, setConnectModal] = useState<InitiateResult | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] =
    useState<"pending" | "connected" | "expired" | "error" | null>(null);
  const [testing, setTesting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/m365/sync-status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus((await r.json()) as SyncStatus);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    try {
      const r2 = await fetch("/api/admin/m365/delegated-status");
      if (r2.ok) setDelegated((await r2.json()) as DelegatedStatus);
    } catch {
      // Non-fatal — delegated status is optional surface.
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

  async function startConnect() {
    setConnectError(null);
    setConnectStatus("pending");
    try {
      const r = await fetch("/api/admin/m365/delegated-connect/initiate", {
        method: "POST",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const init = (await r.json()) as InitiateResult;
      setConnectModal(init);
    } catch (e) {
      setConnectError(String((e as Error).message ?? e));
      setConnectStatus("error");
      toast.error(String((e as Error).message ?? e));
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect eDiscovery delegated authorization? eDiscovery operations will fail until re-authorized.",
      )
    )
      return;
    try {
      const r = await fetch("/api/admin/m365/delegated-disconnect", {
        method: "POST",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Delegated authorization disconnected");
      await reload();
    } catch (e) {
      toast.error(`Disconnect failed: ${String(e)}`);
    }
  }

  async function testDelegated() {
    setTesting(true);
    try {
      const r = await fetch("/api/admin/m365/delegated-test", {
        method: "POST",
      });
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        caseCount?: number;
        accountUpn?: string;
        error?: { code?: string; message?: string };
      };
      if (body.ok) {
        toast.success(
          `eDiscovery API reachable — ${body.caseCount ?? 0} case(s)`,
        );
      } else {
        toast.error(
          `Test failed: ${body.error?.code ?? "ERROR"} ${
            body.error?.message ?? ""
          }`,
        );
      }
      await reload();
    } catch (e) {
      toast.error(`Test failed: ${String(e)}`);
    } finally {
      setTesting(false);
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
              style={primaryBtn(verifying)}
            >
              {verifying ? "Verifying…" : "Verify now"}
            </button>
          )}
        </div>

        {!status && <div style={{ color: C.t3, fontSize: 11 }}>Loading…</div>}
        {status && (
          <div style={cellGrid}>
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
                  ? new Date(status.lastVerifiedAt)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 16)
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
          <div style={errBanner}>{error}</div>
        )}
      </Card>

      {/* ── eDiscovery delegated auth card (sub-PR 4c.1) ─────────── */}
      <DelegatedAuthCard
        status={delegated}
        onConnect={startConnect}
        onDisconnect={disconnect}
        onTest={testDelegated}
        testing={testing}
      />

      {connectError && !connectModal && (
        <Card>
          <div style={errBanner}>{connectError}</div>
        </Card>
      )}

      {connectModal && (
        <DeviceCodeModal
          init={connectModal}
          status={connectStatus ?? "pending"}
          onPollUpdate={(p) => {
            setConnectStatus(p.status);
            if (p.error) setConnectError(p.error.message);
          }}
          onClose={async (success) => {
            setConnectModal(null);
            setConnectStatus(null);
            if (success) {
              toast.success("eDiscovery delegated authorization connected");
            }
            await reload();
          }}
        />
      )}

      {verifyResult && (
        <Card>
          <SH icon="✓" title="Last verify result" />
          <div style={cellGrid}>
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

// ────────────────────────────────────────────────────────────────────
// Delegated auth card
// ────────────────────────────────────────────────────────────────────

const DelegatedAuthCard: React.FC<{
  status: DelegatedStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  testing: boolean;
}> = ({ status, onConnect, onDisconnect, onTest, testing }) => {
  if (!status) {
    return (
      <Card>
        <SH
          icon="🔐"
          title="eDiscovery delegated authorization"
          sub="Loading…"
        />
      </Card>
    );
  }

  const isExpired = status.expired || (!status.configured && !!status.lastRefreshError);

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <SH
          icon="🔐"
          title="eDiscovery delegated authorization"
          sub={
            isExpired
              ? "Authorization expired — re-authorize required"
              : status.configured
                ? "Connected via Device Code"
                : "Required for applyPreservation, releasePreservation, preserveDepartedMailbox"
          }
        />
        <div style={{ display: "flex", gap: 8 }}>
          {status.configured && !isExpired && (
            <>
              <button
                type="button"
                onClick={onTest}
                disabled={testing}
                style={secondaryBtn(testing)}
              >
                {testing ? "Testing…" : "Test eDiscovery"}
              </button>
              <button type="button" onClick={onConnect} style={secondaryBtn(false)}>
                Re-authorize
              </button>
              <button type="button" onClick={onDisconnect} style={dangerBtn}>
                Disconnect
              </button>
            </>
          )}
          {(!status.configured || isExpired) && (
            <button type="button" onClick={onConnect} style={primaryBtn(false)}>
              {isExpired ? "Re-authorize Now" : "Connect eDiscovery (Device Code)"}
            </button>
          )}
        </div>
      </div>

      <div style={cellGrid}>
        <Cell label="Status">
          <Pill
            t={
              isExpired
                ? "EXPIRED"
                : status.configured
                  ? "CONNECTED"
                  : "NOT CONNECTED"
            }
            c={isExpired ? C.rd : status.configured ? C.gn : C.am}
          />
        </Cell>
        {status.accountUpn && (
          <Cell label="Account">
            <span style={{ fontFamily: M }}>{status.accountUpn}</span>
          </Cell>
        )}
        {status.authorizedByName && (
          <Cell label="Authorized by">
            <span>{status.authorizedByName}</span>
          </Cell>
        )}
        {status.authorizedAt && (
          <Cell label="Authorized at">
            <span style={{ fontFamily: M }}>
              {fmtTimestamp(status.authorizedAt)}
            </span>
          </Cell>
        )}
        {status.tokenExpiresAt && !isExpired && (
          <Cell label="Token expires">
            <span style={{ fontFamily: M }}>
              {fmtTimestamp(status.tokenExpiresAt)} (auto-refresh)
            </span>
          </Cell>
        )}
        {status.scopesGranted.length > 0 && (
          <Cell label="Scopes">
            <span style={{ fontFamily: M, fontSize: 10.5 }}>
              {status.scopesGranted
                .map((s) => s.replace("https://graph.microsoft.com/", ""))
                .join(", ")}
            </span>
          </Cell>
        )}
        {isExpired && status.lastRefreshError && (
          <Cell label="Microsoft error">
            <span style={{ color: C.rd, fontFamily: M, fontSize: 10.5 }}>
              {status.lastRefreshError}
            </span>
          </Cell>
        )}
      </div>

      {isExpired && (
        <div style={{ ...errBanner, marginTop: 14 }}>
          Active eDiscovery operations will fail until re-authorized. Click
          “Re-authorize Now” to start a new Device Code flow.
        </div>
      )}
    </Card>
  );
};

// ────────────────────────────────────────────────────────────────────
// Device Code modal — displays user code + polls for completion
// ────────────────────────────────────────────────────────────────────

const DeviceCodeModal: React.FC<{
  init: InitiateResult;
  status: "pending" | "connected" | "expired" | "error";
  onPollUpdate: (p: PollResult) => void;
  onClose: (success: boolean) => void;
}> = ({ init, status, onPollUpdate, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(
      0,
      Math.floor((new Date(init.expiresAt).getTime() - Date.now()) / 1000),
    ),
  );
  const closedRef = useRef(false);
  const liveStatus = useRef(status);
  liveStatus.current = status;

  // Countdown.
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Polling.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      while (!cancelled && !closedRef.current) {
        try {
          const r = await fetch(
            `/api/admin/m365/delegated-connect/poll?sessionId=${encodeURIComponent(init.sessionId)}`,
          );
          if (!r.ok) {
            onPollUpdate({
              status: "error",
              accountUpn: null,
              scopesGranted: [],
              error: { code: "POLL_HTTP", message: `HTTP ${r.status}` },
            });
            break;
          }
          const body = (await r.json()) as PollResult;
          onPollUpdate(body);
          if (body.status === "connected") {
            // Brief pause so the user sees "Connected" before close.
            setTimeout(() => {
              if (!closedRef.current) {
                closedRef.current = true;
                onClose(true);
              }
            }, 700);
            return;
          }
          if (body.status === "expired" || body.status === "error") {
            return;
          }
        } catch (err) {
          onPollUpdate({
            status: "error",
            accountUpn: null,
            scopesGranted: [],
            error: { code: "POLL_FAIL", message: String(err) },
          });
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    void tick();
    return () => {
      cancelled = true;
    };
  }, [init.sessionId, onClose, onPollUpdate]);

  function copyCode() {
    void navigator.clipboard.writeText(init.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <ModalShell
      title="Connect eDiscovery delegated access"
      icon="🔐"
      ariaLabel="Connect eDiscovery delegated access"
      onClose={() => {
        closedRef.current = true;
        onClose(false);
      }}
      maxWidth={560}
    >
      <div style={{ display: "grid", gap: 14, fontSize: 12 }}>
        <Step n={1}>
          <div>Open this URL in a new tab:</div>
          <a
            href={init.verificationUri}
            target="_blank"
            rel="noreferrer"
            style={{ color: C.bl, fontFamily: M, fontSize: 12 }}
          >
            {init.verificationUri}
          </a>
        </Step>

        <Step n={2}>
          <div>Enter this code:</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code
              style={{
                background: C.s1,
                border: `1px solid ${C.brL}`,
                padding: "8px 14px",
                borderRadius: 4,
                fontFamily: M,
                fontSize: 16,
                letterSpacing: 2,
                color: C.t1,
              }}
            >
              {init.userCode}
            </code>
            <button type="button" onClick={copyCode} style={secondaryBtn(false)}>
              {copied ? "Copied!" : "Copy code"}
            </button>
          </div>
        </Step>

        <Step n={3}>
          <div>
            Sign in as your dedicated M365 eDiscovery service account (e.g.{" "}
            <code style={{ fontFamily: M }}>aegis-svc@yourcompany.onmicrosoft.com</code>).
          </div>
          <div
            style={{
              marginTop: 8,
              padding: 10,
              border: `1px solid ${C.am}`,
              background: C.amG,
              color: C.am,
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            <strong>Important:</strong> do NOT use a human admin account. The
            service account must be assigned <em>eDiscovery Manager</em> and{" "}
            <em>SharePoint Admin</em> roles in Purview.
          </div>
        </Step>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
            fontSize: 11,
            color: C.t3,
          }}
        >
          <span style={{ fontFamily: M }}>
            Code expires in: {mins}:{secs.toString().padStart(2, "0")}
          </span>
          <span>
            Status:{" "}
            <strong
              style={{
                color:
                  status === "connected"
                    ? C.gn
                    : status === "error" || status === "expired"
                      ? C.rd
                      : C.am,
              }}
            >
              {status === "connected"
                ? "Connected ✓"
                : status === "error"
                  ? "Error"
                  : status === "expired"
                    ? "Expired"
                    : "Waiting for sign-in…"}
            </strong>
          </span>
        </div>
      </div>
    </ModalShell>
  );
};

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({
  n,
  children,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "30px 1fr",
      gap: 10,
      alignItems: "start",
    }}
  >
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: C.bl,
        color: C.bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontFamily: M,
        fontSize: 12,
      }}
    >
      {n}
    </div>
    <div style={{ paddingTop: 4 }}>{children}</div>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// Reusable bits
// ────────────────────────────────────────────────────────────────────

function sourceCaption(s: SyncStatus): string {
  if (!s.configured) return "No credentials resolved — running in mock mode";
  if (s.source === "per-org") return "Connected · per-org credentials";
  if (s.source === "env") return "Connected · process env vars";
  return "Connected";
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

const cellGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr",
  gap: 6,
  marginTop: 14,
  fontSize: 11,
};

const errBanner: React.CSSProperties = {
  marginTop: 10,
  padding: 8,
  border: `1px solid ${C.rd}`,
  background: C.rdG,
  color: C.rd,
  fontFamily: M,
  fontSize: 11,
  borderRadius: 4,
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: C.bl,
    border: "none",
    color: C.bg,
    padding: "6px 14px",
    borderRadius: 4,
    fontFamily: F,
    fontWeight: 700,
    fontSize: 11,
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    opacity: disabled ? 0.5 : 1,
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.brL}`,
    color: C.t1,
    padding: "6px 12px",
    borderRadius: 4,
    fontFamily: F,
    fontWeight: 600,
    fontSize: 11,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const dangerBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.rd}`,
  color: C.rd,
  padding: "6px 12px",
  borderRadius: 4,
  fontFamily: F,
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};

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
