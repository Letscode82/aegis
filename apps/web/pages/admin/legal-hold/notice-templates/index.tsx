import dynamic from "next/dynamic";
import Head from "next/head";

const NoticeTemplatesAdmin = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.NoticeTemplatesAdmin),
  { ssr: false },
);

export default function AdminNoticeTemplatesPage() {
  return (
    <>
      <Head>
        <title>AEGIS · Hold notice templates</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <NoticeTemplatesAdmin />
      </main>
    </>
  );
}
