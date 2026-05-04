import type { AppProps } from "next/app";
import { ToastProvider } from "@aegis/ui";
import { installStoragePolyfill } from "@aegis/intake/polyfill";

// Install the window.storage polyfill before any child component renders.
// This runs at module-evaluation time on the client; the Intake module's
// storage layer (tickets, conversations, agent log, cockpit state) assumes
// window.storage exists. The polyfill is a no-op on the server.
if (typeof window !== "undefined") {
  installStoragePolyfill();
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Component {...pageProps} />
    </ToastProvider>
  );
}
