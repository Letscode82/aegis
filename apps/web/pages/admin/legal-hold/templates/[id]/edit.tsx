import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const NoticeTemplateEditor = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.NoticeTemplateEditor),
  { ssr: false },
);

export default function AdminTemplateEditPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  return (
    <>
      <Head>
        <title>AEGIS · Edit notice template</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        {id && <NoticeTemplateEditor templateId={id} />}
      </main>
    </>
  );
}
