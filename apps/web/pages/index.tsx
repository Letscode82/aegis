import dynamic from "next/dynamic";
import Head from "next/head";

// AppShell is a client-only component: it consumes window.storage,
// localStorage, and other browser-only APIs through @aegis/intake. We disable
// SSR for the entire shell to keep that contract simple.
const AppShell = dynamic(() => import("../src/AppShell.jsx"), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>AEGIS · Legal Mission Control</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <AppShell />
    </>
  );
}
