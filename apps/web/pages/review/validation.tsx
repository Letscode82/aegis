/**
 * /review/validation — the org-wide AI Validation dashboard (AIR-6 read half).
 * Recall / precision / F1 / overturn across every scored pilot, grouped by the
 * review profile it ran under, with drift sparklines. Reads
 * /api/review/validation/dashboard.
 */
import dynamic from "next/dynamic";
import Head from "next/head";

const ValidationDashboard = dynamic(
  () => import("@aegis/review/ui").then((m) => m.ValidationDashboard),
  { ssr: false },
);

export default function ValidationDashboardPage() {
  return (
    <>
      <Head>
        <title>AEGIS · AI Validation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <ValidationDashboard />
      </main>
    </>
  );
}
