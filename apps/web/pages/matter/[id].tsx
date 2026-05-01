import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { Nav } from "./index";

const MatterDetailView = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.MatterDetailView),
  { ssr: false },
);

export default function MatterDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  return (
    <>
      <Head>
        <title>AEGIS · Matter</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <Nav active="list" />
        {id && <MatterDetailView matterId={id} />}
      </main>
    </>
  );
}
