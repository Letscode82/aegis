/**
 * /matter/[id]/new-hold-wizard — the Hold Wizard route.
 *
 * The wizard is a parallel entry point to the existing
 * power-user single-page hold workspace. Both produce the same
 * outcome (a `LegalHold` row + per-source preservations) — the
 * wizard guides counsel step-by-step, the workspace assumes
 * familiarity.
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const HoldWizard = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.HoldWizard),
  { ssr: false },
);

export default function NewHoldWizardPage() {
  const router = useRouter();
  const matterId = typeof router.query.id === "string" ? router.query.id : "";
  if (!matterId) return null;
  return (
    <>
      <Head>
        <title>AEGIS · New legal hold</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <HoldWizard
          matterId={matterId}
          onCancel={() => router.push(`/matter/${matterId}`)}
          onComplete={(holdId) =>
            router.push(`/matter/${matterId}/holds/${holdId}`)
          }
        />
      </main>
    </>
  );
}
