/**
 * /matter/[id]/holds/[holdId]/review — the first-class Collect & Review
 * workspace. A dedicated full-page surface (not the cramped rail card + fixed
 * overlay) that guides collection → AI review → production for a legal hold.
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const CollectReviewWorkspace = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.CollectReviewWorkspace),
  { ssr: false },
);

export default function HoldReviewPage() {
  const router = useRouter();
  const matterId = typeof router.query.id === "string" ? router.query.id : "";
  const holdId = typeof router.query.holdId === "string" ? router.query.holdId : "";
  if (!matterId || !holdId) return null;
  return (
    <>
      <Head>
        <title>AEGIS · Collect &amp; Review</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <CollectReviewWorkspace
          matterId={matterId}
          holdId={holdId}
          onBack={() => router.push(`/matter/${matterId}/holds/${holdId}`)}
        />
      </main>
    </>
  );
}
