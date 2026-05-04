/**
 * /custodian/holds/[holdId]/acknowledge — custodian-side
 * acknowledgment page.
 *
 * Permission gate: matter:legal_hold:custodian_view (resource-scoped
 * server-side at the API layer). The page renders nothing if the
 * resolved user has no LegalHoldCustodian row for this hold.
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { AuthUser } from "@aegis/auth";

const CustodianAttestationView = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.CustodianAttestationView),
  { ssr: false },
);

interface CustodianHint {
  matterId: string;
  personId: string;
}

export default function CustodianAckPage() {
  const router = useRouter();
  const holdId = typeof router.query.holdId === "string" ? router.query.holdId : null;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hint, setHint] = useState<CustodianHint | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the current user to find a Person row for them.
  useEffect(() => {
    if (!holdId) return;
    fetch("/api/auth/current-user")
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: { user: AuthUser | null }) => setUser(d.user))
      .catch((e) => setError(String(e)));
  }, [holdId]);

  // Discover the matterId + personId for this hold + user. The API
  // exposes a hint endpoint inline below — for now we look up via
  // the hold's parent matter through the legal-hold detail GET.
  useEffect(() => {
    if (!holdId || !user) return;
    fetch(`/api/custodian/hold-context?holdId=${encodeURIComponent(holdId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: CustodianHint) => setHint(d))
      .catch(() => setError("Hold not accessible to your account."));
  }, [holdId, user]);

  if (error)
    return (
      <main style={{ padding: 30, color: "#E5484D", fontFamily: "Inter,sans-serif" }}>
        {error}
      </main>
    );
  if (!holdId || !user || !hint)
    return (
      <main style={{ padding: 30, color: "#8B93AE", fontFamily: "Inter,sans-serif" }}>
        Loading…
      </main>
    );

  return (
    <>
      <Head>
        <title>AEGIS · Hold acknowledgment</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <CustodianAttestationView
          holdId={holdId}
          personId={hint.personId}
          matterId={hint.matterId}
        />
      </main>
    </>
  );
}
