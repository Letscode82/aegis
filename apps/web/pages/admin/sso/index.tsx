/**
 * /admin/sso — SSO / SAML federation admin (C-6 follow-up).
 *
 * The per-tenant SSO connection model, resolver, routing seam, and CRUD API
 * (GET|PUT|DELETE /api/admin/sso/connections) all shipped with C-6; the only
 * missing piece was an admin surface to manage the connection without hand-
 * rolling API calls. This is that page.
 *
 * Self-contained client page (same shape as /admin/m365): it talks only to the
 * existing apps/web CRUD route, which enforces `admin:manage_users` and writes
 * the chain-sealed `auth.sso.connection.*` audit rows. No new API, no schema,
 * no package UI surface. One connection per org.
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, Card, FormField, inputStyle, useToast } from "@aegis/ui";

// Mirrors @aegis/auth RoleName (the 8 canonical roles). Hardcoded rather than
// imported so this client page doesn't pull the server-side auth module into
// the browser bundle; the API validates the value against ALL_ROLES anyway.
const ROLE_NAMES = [
  "requester",
  "viewer",
  "external_counsel",
  "paralegal",
  "attorney",
  "legal_ops",
  "gc",
  "admin",
] as const;

const PROTOCOLS = ["OIDC", "SAML"] as const;

interface SsoConnection {
  id?: string;
  displayName: string;
  protocol: (typeof PROTOCOLS)[number];
  connectionName: string;
  emailDomains: string[];
  defaultRoleName: string;
  jitProvisioning: boolean;
  enabled: boolean;
}

const EMPTY: SsoConnection = {
  displayName: "",
  protocol: "OIDC",
  connectionName: "",
  emailDomains: [],
  defaultRoleName: "requester",
  jitProvisioning: true,
  enabled: true,
};

function parseDomains(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const d = part.trim().toLowerCase().replace(/^@/, "");
    if (d && d.includes(".") && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

export default function AdminSsoPage() {
  const toast = useToast();
  const [form, setForm] = useState<SsoConnection>(EMPTY);
  const [domainsText, setDomainsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyRow = useCallback((row: SsoConnection | null) => {
    if (row) {
      setForm({
        id: row.id,
        displayName: row.displayName || "",
        protocol: PROTOCOLS.includes(row.protocol) ? row.protocol : "OIDC",
        connectionName: row.connectionName || "",
        emailDomains: Array.isArray(row.emailDomains) ? row.emailDomains : [],
        defaultRoleName: row.defaultRoleName || "requester",
        jitProvisioning: row.jitProvisioning !== false,
        enabled: row.enabled !== false,
      });
      setDomainsText((Array.isArray(row.emailDomains) ? row.emailDomains : []).join(", "));
      setExists(true);
    } else {
      setForm(EMPTY);
      setDomainsText("");
      setExists(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch("/api/admin/sso/connections");
        const d = await resp.json().catch(() => ({}));
        if (!alive) return;
        if (resp.status === 403) {
          setError("You need the Manage Users permission to configure SSO.");
        } else if (d && d.ok) {
          applyRow(d.connection ?? null);
        } else {
          setError((d && d.error) || "Could not load the SSO connection.");
        }
      } catch {
        if (alive) setError("Could not load the SSO connection.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyRow]);

  const save = useCallback(async () => {
    const emailDomains = parseDomains(domainsText);
    if (!form.displayName.trim() || !form.connectionName.trim() || emailDomains.length === 0) {
      toast.warning("Display name, broker connection name, and at least one email domain are required.");
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/sso/connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, emailDomains }),
      });
      const d = await resp.json().catch(() => ({}));
      if (d && d.ok) {
        applyRow(d.connection);
        toast.success("SSO connection saved.");
      } else {
        toast.error((d && d.error) || "Save failed.");
      }
    } catch {
      toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }, [form, domainsText, applyRow, toast]);

  const remove = useCallback(async () => {
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/sso/connections", { method: "DELETE" });
      const d = await resp.json().catch(() => ({}));
      if (d && d.ok) {
        applyRow(null);
        toast.success("SSO connection removed.");
      } else {
        toast.error((d && d.error) || "Delete failed.");
      }
    } catch {
      toast.error("Delete failed.");
    } finally {
      setSaving(false);
    }
  }, [applyRow, toast]);

  const set = <K extends keyof SsoConnection>(k: K, v: SsoConnection[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Head>
        <title>AEGIS · SSO federation</title>
      </Head>
      <main style={{ background: C.bg, minHeight: "100vh", padding: "32px 20px", fontFamily: F, color: C.t1 }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Admin · Enterprise</div>
          <h1 style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>SSO / SAML federation</h1>
          <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6, margin: "0 0 20px", maxWidth: "62ch" }}>
            One per-tenant identity connection for your organization. Users whose email matches one of the domains below are routed to this IdP at login; a first-time federated user is provisioned into this org with the default role. Auth0 brokers the connection today.
          </p>

          {loading ? (
            <Card style={{ padding: 18, color: C.t3, fontFamily: M, fontSize: 12 }}>Loading…</Card>
          ) : error ? (
            <Card style={{ padding: 18, color: C.am, fontFamily: M, fontSize: 12.5, lineHeight: 1.6 }}>⚠ {error}</Card>
          ) : (
            <Card style={{ padding: 20, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9, fontFamily: M, letterSpacing: 0.5, textTransform: "uppercase", color: exists ? C.gn : C.t4, border: `1px solid ${exists ? C.gn : C.br}`, borderRadius: 4, padding: "1px 7px" }}>
                  {exists ? "Configured" : "Not configured"}
                </span>
                {exists && (
                  <span style={{ fontSize: 9, fontFamily: M, letterSpacing: 0.5, textTransform: "uppercase", color: form.enabled ? C.gn : C.am, border: `1px solid ${form.enabled ? C.gn : C.am}`, borderRadius: 4, padding: "1px 7px" }}>
                    {form.enabled ? "Enabled" : "Disabled"}
                  </span>
                )}
              </div>

              <FormField label="Display name">
                <input style={inputStyle} value={form.displayName} placeholder="Acme Corp SSO" onChange={(e) => set("displayName", e.target.value)} />
              </FormField>

              <FormField label="Broker connection name (Auth0)">
                <input style={inputStyle} value={form.connectionName} placeholder="acme-saml" onChange={(e) => set("connectionName", e.target.value)} />
              </FormField>

              <FormField label="Protocol">
                <select style={inputStyle} value={form.protocol} onChange={(e) => set("protocol", e.target.value as SsoConnection["protocol"])}>
                  {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </FormField>

              <FormField label="Email domains (comma or space separated)">
                <input style={inputStyle} value={domainsText} placeholder="acme.com, acme.co.uk" onChange={(e) => setDomainsText(e.target.value)} />
              </FormField>
              <div style={{ marginTop: -8, fontSize: 11, color: C.t4, fontFamily: M }}>
                Will store: {parseDomains(domainsText).join(", ") || "—"}
              </div>

              <FormField label="Default role for new federated users">
                <select style={inputStyle} value={form.defaultRoleName} onChange={(e) => set("defaultRoleName", e.target.value)}>
                  {ROLE_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </FormField>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.t2 }}>
                <input type="checkbox" checked={form.jitProvisioning} onChange={(e) => set("jitProvisioning", e.target.checked)} />
                Just-in-time provisioning (create the user on first SSO login)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.t2 }}>
                <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
                Enabled (route matching users to this IdP)
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button type="button" onClick={save} disabled={saving} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, fontFamily: F, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : exists ? "Save changes" : "Create connection"}
                </button>
                {exists && (
                  <button type="button" onClick={remove} disabled={saving} style={{ background: "transparent", color: C.rd, border: `1px solid ${C.rd}55`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontFamily: F, cursor: saving ? "default" : "pointer" }}>
                    Remove
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
