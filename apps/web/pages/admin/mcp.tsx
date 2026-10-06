/**
 * /admin/mcp — internal admin surface for C-12 MCP access tokens.
 *
 * Mint / list / revoke the bearer tokens external agents use to call the AEGIS
 * MCP server (`POST /api/mcp`). A minted token's raw value is shown ONCE here;
 * only its hash is stored. Tokens are inert until the platform flag
 * `AEGIS_MCP_ENABLED` is turned on. Gated client-side by `admin:manage_users`
 * (the route enforces it server-side too).
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, Card, useToast } from "@aegis/ui";
import { useCurrentUser } from "@aegis/auth/react";
import { Permission } from "@aegis/auth";

interface TokenRow {
  id: string;
  label: string;
  scopes: string[];
  status: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const SCOPE_CATALOG: { scope: string; label: string }[] = [
  { scope: "matter:read", label: "Matters (list, dashboard, workload)" },
  { scope: "privacy:read", label: "Privacy / DSAR (list, dashboards)" },
  { scope: "intake:read", label: "Intake exec summary" },
  { scope: "search", label: "Semantic search" },
];

export default function McpAdminPage() {
  const toast = useToast();
  const { has, loading: permLoading } = useCurrentUser();
  const allowed = has(Permission.AdminManageUsers);

  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(["matter:read"]));
  const [wildcard, setWildcard] = useState(false);
  const [days, setDays] = useState("90");
  const [minted, setMinted] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/mcp/tokens");
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { setError("You need admin:manage_users to manage MCP tokens."); return; }
      if (!r.ok || !d.ok) { setError((d && d.error) || "Could not load tokens."); return; }
      setTokens(d.tokens || []);
      setError(null);
    } catch {
      setError("Could not load tokens.");
    }
  }, []);

  useEffect(() => {
    if (permLoading || !allowed) return;
    load();
  }, [permLoading, allowed, load]);

  const toggleScope = (scope: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope); else next.add(scope);
      return next;
    });
  };

  const mint = useCallback(async () => {
    const scopes = wildcard ? ["*"] : Array.from(picked);
    if (!label.trim()) { toast.error("Give the token a label."); return; }
    if (scopes.length === 0) { toast.error("Pick at least one scope."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/mcp/tokens", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), scopes, expiresInDays: Number(days) || 90 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Mint failed (HTTP ${r.status})`);
      setMinted(d.minted.rawToken);
      setLabel("");
      toast.success("Token generated — copy it now, it won't be shown again.");
      await load();
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [wildcard, picked, label, days, load, toast]);

  const revoke = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/mcp/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Revoke failed (HTTP ${r.status})`);
      toast.success("Token revoked.");
      await load();
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [load, toast]);

  const copy = useCallback((v: string) => {
    try { navigator.clipboard?.writeText(v); toast.success("Copied."); }
    catch { toast.info("Select and copy manually."); }
  }, [toast]);

  return (
    <>
      <Head><title>AEGIS · MCP access tokens</title></Head>
      <main style={{ background: C.bg, minHeight: "100vh", padding: "32px 20px", fontFamily: F, color: C.t1 }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Admin · Integrations</div>
          <h1 style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>MCP access tokens</h1>
          <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px", maxWidth: "68ch" }}>
            Bearer tokens let an external agent call the AEGIS MCP server (<code style={{ fontFamily: M, fontSize: 12 }}>POST /api/mcp</code>) to run read-only tools scoped to this organization. A token is shown once when generated — copy it then; only its hash is stored.
          </p>
          <Card style={{ padding: "10px 14px", marginBottom: 20, color: C.am, fontFamily: M, fontSize: 11.5, background: C.amG, border: `1px solid ${C.am}44` }}>
            The MCP server is <strong>off by default</strong>. Tokens stay inert until the platform flag <code>AEGIS_MCP_ENABLED</code> is set in the environment.
          </Card>

          {permLoading ? (
            <Card style={{ padding: 18, color: C.t3, fontFamily: M, fontSize: 12 }}>Loading…</Card>
          ) : !allowed ? (
            <Card style={{ padding: 18, color: C.am, fontFamily: M, fontSize: 12.5 }}>⚠ You need admin access to manage MCP tokens.</Card>
          ) : (
            <>
              {/* Mint form */}
              <Card style={{ padding: 18, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontFamily: SR, color: C.t1, marginBottom: 12 }}>Generate a token</div>
                <label style={{ display: "block", fontSize: 11, fontFamily: M, color: C.t3, marginBottom: 4 }}>Label</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Acme research agent"
                  style={{ width: "100%", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: F, fontSize: 13, padding: "8px 10px", marginBottom: 14, boxSizing: "border-box" }} />
                <div style={{ fontSize: 11, fontFamily: M, color: C.t3, marginBottom: 6 }}>Scopes</div>
                <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.t2, cursor: "pointer" }}>
                    <input type="checkbox" checked={wildcard} onChange={(e) => setWildcard(e.target.checked)} />
                    All read tools (<code style={{ fontFamily: M }}>*</code>)
                  </label>
                  {!wildcard && SCOPE_CATALOG.map((s) => (
                    <label key={s.scope} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.t2, cursor: "pointer" }}>
                      <input type="checkbox" checked={picked.has(s.scope)} onChange={() => toggleScope(s.scope)} />
                      <code style={{ fontFamily: M, fontSize: 11.5, color: C.t1 }}>{s.scope}</code>
                      <span style={{ color: C.t4 }}>— {s.label}</span>
                    </label>
                  ))}
                </div>
                <label style={{ display: "block", fontSize: 11, fontFamily: M, color: C.t3, marginBottom: 4 }}>Expires in (days)</label>
                <input value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
                  style={{ width: 120, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 6, color: C.t1, fontFamily: M, fontSize: 13, padding: "8px 10px", marginBottom: 14 }} />
                <div>
                  <button type="button" onClick={mint} disabled={busy}
                    style={{ background: C.em, color: C.bg, border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 600, fontFamily: F, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
                    {busy ? "Working…" : "Generate token"}
                  </button>
                </div>
                {minted && (
                  <div style={{ marginTop: 14, padding: "10px 12px", background: C.emG, border: `1px solid ${C.em}55`, borderRadius: 6 }}>
                    <div style={{ fontSize: 9.5, fontFamily: M, color: C.em, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Copy this token now — it won't be shown again</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input readOnly value={minted} style={{ flex: 1, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: M, fontSize: 11, padding: "7px 9px" }} />
                      <button type="button" onClick={() => copy(minted)} style={{ background: C.s2, color: C.t1, border: `1px solid ${C.br}`, borderRadius: 5, padding: "7px 12px", fontSize: 11, fontFamily: M, cursor: "pointer" }}>Copy</button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Token list */}
              {error ? (
                <Card style={{ padding: 18, color: C.am, fontFamily: M, fontSize: 12.5 }}>⚠ {error}</Card>
              ) : tokens === null ? (
                <Card style={{ padding: 18, color: C.t3, fontFamily: M, fontSize: 12 }}>Loading tokens…</Card>
              ) : tokens.length === 0 ? (
                <Card style={{ padding: 22, color: C.t3, fontFamily: M, fontSize: 12.5, textAlign: "center" }}>No tokens yet.</Card>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {tokens.map((t) => (
                    <Card key={t.id} style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: C.t1, fontWeight: 500 }}>{t.label}</div>
                          <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>
                            {t.scopes.join(", ")} · expires {new Date(t.expiresAt).toLocaleDateString()}
                            {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : " · never used"}
                          </div>
                        </div>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: t.status === "ACTIVE" ? C.gn : C.t4, border: `1px solid ${(t.status === "ACTIVE" ? C.gn : C.t4)}55`, borderRadius: 4, padding: "2px 8px" }}>
                          {t.status}
                        </span>
                        {t.status === "ACTIVE" && (
                          <button type="button" onClick={() => revoke(t.id)} disabled={busy}
                            style={{ background: "transparent", color: C.rd, border: `1px solid ${C.rd}55`, borderRadius: 7, padding: "7px 13px", fontSize: 12, fontFamily: F, cursor: "pointer" }}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
