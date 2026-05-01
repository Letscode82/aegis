import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { Nav } from "./index";

const MatterCreateForm = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.MatterCreateForm),
  { ssr: false },
);

export default function MatterNewPage() {
  const router = useRouter();
  const intakeTicketId =
    typeof router.query.intakeTicketId === "string"
      ? router.query.intakeTicketId
      : undefined;
  return (
    <>
      <Head>
        <title>AEGIS · New matter</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <Nav active="new" />
        <div style={{ padding: 14 }}>
          <MatterCreateForm
            intakeTicketId={intakeTicketId}
            onCreated={(id: string) => router.push(`/matter/${id}`)}
            onCancel={() => router.push("/matter/list")}
          />
        </div>
      </main>
    </>
  );
}
