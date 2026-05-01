import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { Nav } from "./index";

const MatterListView = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.MatterListView),
  { ssr: false },
);

export default function MatterListPage() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>AEGIS · All matters</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <Nav active="list" />
        <MatterListView
          onSelect={(id: string) => router.push(`/matter/${id}`)}
          onCreate={() => router.push("/matter/new")}
        />
      </main>
    </>
  );
}
