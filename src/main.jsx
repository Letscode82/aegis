// Install the window.storage polyfill first — everything downstream
// (storage/store.js, intake hooks, seed loader) assumes it exists.
import { installStoragePolyfill } from "./storage/polyfill";
installStoragePolyfill();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App/>
  </StrictMode>
);
