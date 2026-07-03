import type { AppProps } from "next/app";
import { ToastProvider } from "@aegis/ui";
import { installStoragePolyfill } from "@aegis/intake/polyfill";
import { installClientErrorReporter } from "../lib/client-error-reporter";

// Install the window.storage polyfill before any child component renders.
// This runs at module-evaluation time on the client; the Intake module's
// storage layer (tickets, conversations, agent log, cockpit state) assumes
// window.storage exists. The polyfill is a no-op on the server.
if (typeof window !== "undefined") {
  installStoragePolyfill();
  // W4-5 — uncaught browser errors / rejections post to
  // /api/client-errors as structured log events (throttled).
  installClientErrorReporter();
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Component {...pageProps} />
    </ToastProvider>
  );
}
