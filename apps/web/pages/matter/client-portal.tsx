/**
 * /matter/client-portal — internal admin surface for C-10 client portals.
 *
 * Lists everyone who is a party on at least one matter, with their current
 * portal-link status, and lets staff mint / revoke a login-less link per
 * client. The minted link is shown ONCE (copy it then); only its hash is
 * stored. Gated client-side by `matter:read_all` (mint/revoke enforce
 * `matter:update` server-side).
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, Card, useToast } from "@aegis/ui";
import { useCurrentUser } from "@aegis/auth/react";
import { Permission } from "@aegis/auth";

interface Recipient {
  personId: string;
  name: string;
  email: string | null;
  matterCount: number;
  token: { id: string; status: string; expiresAt: string; lastViewedAt: string | null } | null;
}

function originBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function ClientPortalAdminPage() {
  const toast = useToast();
  const { has, loading: permLoading } = useCurrentUser();
  const allowed = has(Permission.MatterReadAll);
  const canManage = has(Permission.MatterUpdate);

  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mintedLink, setMintedLink] = useState<{ personId: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/matter/client-portal");
      const d = await r.json().catch(() => ({}));
      if (r.status === 403) { setError("You need matter read access to manage client portals."); return; }
      if (!r.ok || !d.ok) { setError((d && d.error) || "Could not load recipients."); return; }
      setRecipients(d.recipients || []);
      setError(null);
    } catch {
      setError("Could not load recipients.");
    }
  }, []);

  useEffect(() => {
    if (permLoading || !allowed) return;
    load();
  }, [permLoading, allowed, load]);

  const mint = useCallback(async (personId: string) => {
    setBusyId(personId);
    try {
      const r = await fetch("/api/matter/client-portal", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Mint failed (HTTP ${r.status})`);
      const url = d.minted.url.startsWith("http") ? d.minted.url : `${originBase()}${d.minted.url}`;
      setMintedLink({ personId, url });
      toast.success("Portal link generated — copy it now.");
      await load();
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusyId(null);
    }
  }, [load, toast]);

  const revoke = useCallback(async (tokenId: string) => {
    setBusyId(tokenId);
    try {
      const r = await fetch(`/api/matter/client-portal/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Revoke failed (HTTP ${r.status})`);
      toast.success("Portal link revoked.");
      setMintedLink(null);
      await load();
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setBusyId(null);
    }
  }, [load, toast]);

  const copy = useCallback((url: string) => {
    try {
      navigator.clipboard?.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.info("Select and copy the link manually.");
    }
  }, [toast]);

  return (
    <>
      <Head><title>OneLegal · Client portals</title></Head>
      <main style={{ background: C.bg, minHeight: "100vh", padding: "32px 20px", fontFamily: F, color: C.t1 }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Matter · Collaboration</div>
          <h1 style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>Client portals</h1>
          <p style={{ color: C.t3, fontSize: 13, lineHeight: 1.6, margin: "0 0 20px", maxWidth: "64ch" }}>
            Generate a login-less link that lets a client contact see a read-only summary of the matters they're a party to. The link is shown once when generated — copy it then. Only its hash is stored; revoke anytime.
          </p>

          {permLoading ? (
            <Card style={{ padding: 18, color: C.t3, fontFamily: M, fontSize: 12 }}>Loading…</Card>
          ) : !allowed ? (
            <Card style={{ padding: 18, color: C.am, fontFamily: M, fontSize: 12.5 }}>⚠ You need matter read access to manage client portals.</Card>
          ) : error ? (
            <Card style={{ padding: 18, color: C.am, fontFamily: M, fontSize: 12.5 }}>⚠ {error}</Card>
          ) : recipients === null ? (
            <Card style={{ padding: 18, color: C.t3, fontFamily: M, fontSize: 12 }}>Loading recipients…</Card>
          ) : recipients.length === 0 ? (
            <Card style={{ padding: 22, color: C.t3, fontFamily: M, fontSize: 12.5, textAlign: "center" }}>
              No matter parties yet. Add a client contact to a matter's party list first.
            </Card>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recipients.map((rec) => (
                <Card key={rec.personId} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.t1, fontWeight: 500 }}>{rec.name}</div>
                      <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>
                        {rec.email || "no email"} · {rec.matterCount} {rec.matterCount === 1 ? "matter" : "matters"}
                      </div>
                    </div>
                    <span style={{ flex: 1 }} />
                    {rec.token ? (
                      <span style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: C.gn, border: `1px solid ${C.gn}55`, borderRadius: 4, padding: "2px 8px" }}>
                        Active · expires {new Date(rec.token.expiresAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: C.t4, border: `1px solid ${C.br}`, borderRadius: 4, padding: "2px 8px" }}>No link</span>
                    )}
                    {canManage && (rec.token ? (
                      <button type="button" onClick={() => revoke(rec.token!.id)} disabled={busyId === rec.token.id}
                        style={{ background: "transparent", color: C.rd, border: `1px solid ${C.rd}55`, borderRadius: 7, padding: "7px 13px", fontSize: 12, fontFamily: F, cursor: "pointer" }}>
                        Revoke
                      </button>
                    ) : (
                      <button type="button" onClick={() => mint(rec.personId)} disabled={busyId === rec.personId}
                        style={{ background: C.em, color: C.bg, border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, fontFamily: F, cursor: "pointer", opacity: busyId === rec.personId ? 0.6 : 1 }}>
                        {busyId === rec.personId ? "Generating…" : "Generate link"}
                      </button>
                    ))}
                  </div>
                  {mintedLink && mintedLink.personId === rec.personId && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: C.emG, border: `1px solid ${C.em}55`, borderRadius: 6 }}>
                      <div style={{ fontSize: 9.5, fontFamily: M, color: C.em, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Copy this link now — it won't be shown again</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input readOnly value={mintedLink.url} style={{ flex: 1, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: M, fontSize: 11, padding: "7px 9px" }} />
                        <button type="button" onClick={() => copy(mintedLink.url)} style={{ background: C.s2, color: C.t1, border: `1px solid ${C.br}`, borderRadius: 5, padding: "7px 12px", fontSize: 11, fontFamily: M, cursor: "pointer" }}>Copy</button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
