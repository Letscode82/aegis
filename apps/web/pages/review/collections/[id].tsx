/**
 * /review/collections/[id] — the unified, cross-source Collect & Review stage
 * workspace for one collection (Cull → Review → Batches → Produce). Opened from
 * the eDiscovery hub; source-agnostic (operates on the review set via the
 * neutral /api/review/sets namespace).
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const CollectionWorkspace = dynamic(
  () => import("@aegis/review/ui").then((m) => m.CollectionWorkspace),
  { ssr: false },
);

export default function CollectionWorkspacePage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  if (!id) return null;
  return (
    <>
      <Head>
        <title>AEGIS · Collection</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <CollectionWorkspace
          apiBase="/api/review/sets"
          collectionId={id}
          onBack={() => router.push("/?view=ediscovery")}
        />
      </main>
    </>
  );
}
