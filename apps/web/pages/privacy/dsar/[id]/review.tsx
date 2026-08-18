/**
 * /privacy/dsar/[id]/review — the DSAR Collect & Review workspace. Mounts the
 * shared reviewer (@aegis/review) on a DSAR-origin review set, so the data
 * subject's collection is worked with the same engine legal hold uses.
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const DsarReviewWorkspace = dynamic(
  () => import("@aegis/privacy/ui").then((m) => m.DsarReviewWorkspace),
  { ssr: false },
);

export default function DsarReviewPage() {
  const router = useRouter();
  const dsarId = typeof router.query.id === "string" ? router.query.id : "";
  const subjectName = typeof router.query.subject === "string" ? router.query.subject : undefined;
  if (!dsarId) return null;
  return (
    <>
      <Head>
        <title>AEGIS · DSAR Collect &amp; Review</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <DsarReviewWorkspace
          dsarId={dsarId}
          subjectName={subjectName}
          onBack={() => router.push("/?view=dsar")}
        />
      </main>
    </>
  );
}
