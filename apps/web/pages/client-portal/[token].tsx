/**
 * /client-portal/[token] — PUBLIC login-less client portal (C-10).
 *
 * A white-label, read-only view of the matters a client contact is a party
 * to: status, open tasks, active legal holds. The token IS the gate (resolved
 * server-side by /api/portal/client/[token]); no session, no OneLegal account.
 * Self-contained page — no module import beyond @aegis/ui tokens.
 */
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

interface MatterView {
  id: string;
  number: string | null;
  title: string;
  type: string;
  status: string;
  role: string;
  openTasks: number;
  activeHolds: number;
}
interface PortalView {
  organizationName: string;
  personName: string;
  matters: MatterView[];
  generatedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: C.t4, OPEN: C.bl, ACTIVE: C.gn, STAYED: C.am, CLOSED: C.t3, ARCHIVED: C.t4,
};
const prettyRole = (r: string) => r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const prettyType = (t: string) => t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function ClientPortalPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`/api/portal/client/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || !d.ok) setError((d && d.error) || "This link is invalid or has expired.");
        else setView(d.view);
      })
      .catch(() => { if (alive) setError("Unable to load the portal."); });
    return () => { alive = false; };
  }, [token]);

  return (
    <>
      <Head>
        <title>Your matters · OneLegal</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main style={{ background: C.bg, minHeight: "100vh", fontFamily: F, color: C.t1, padding: "40px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {error ? (
            <div style={{ background: C.cd, border: `1px solid ${C.am}55`, borderRadius: 10, padding: 28, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontFamily: SR, color: C.t1, marginBottom: 6 }}>Link unavailable</div>
              <div style={{ fontSize: 13, color: C.t3, fontFamily: M }}>{error}</div>
            </div>
          ) : !view ? (
            <div style={{ color: C.t3, fontFamily: M, fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ marginBottom: 6, fontSize: 10, fontFamily: M, letterSpacing: 2, textTransform: "uppercase", color: C.em }}>
                {view.organizationName} · Client portal
              </div>
              <h1 style={{ fontFamily: SR, fontSize: 26, fontWeight: 500, margin: "0 0 4px" }}>Welcome, {view.personName}</h1>
              <p style={{ color: C.t3, fontSize: 13, fontFamily: M, margin: "0 0 24px" }}>
                A read-only summary of the matters you're involved in. {view.matters.length} {view.matters.length === 1 ? "matter" : "matters"}.
              </p>

              {view.matters.length === 0 ? (
                <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 28, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 13 }}>
                  You aren't currently a party on any matters.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {view.matters.map((m) => (
                    <div key={m.id} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        {m.number && <span style={{ fontSize: 11, fontFamily: M, color: C.em, fontWeight: 600 }}>{m.number}</span>}
                        <span style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>{m.title}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", color: STATUS_COLOR[m.status] || C.t3, border: `1px solid ${(STATUS_COLOR[m.status] || C.t3)}55`, borderRadius: 4, padding: "2px 8px" }}>
                          {m.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.t3, fontFamily: M, display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <span>{prettyType(m.type)}</span>
                        <span>· Your role: {prettyRole(m.role)}</span>
                        <span>· {m.openTasks} open {m.openTasks === 1 ? "task" : "tasks"}</span>
                        {m.activeHolds > 0 && <span style={{ color: C.am }}>· {m.activeHolds} active legal {m.activeHolds === 1 ? "hold" : "holds"}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 24, fontSize: 10, fontFamily: M, color: C.t4 }}>
                Generated {new Date(view.generatedAt).toLocaleString()} · This is a secure read-only link. Please don't share it.
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
