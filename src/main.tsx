import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./app/styles.css";

// Restore before HashRouter mounts. Navigating after the initial render first
// mounts all three main pages (and starts their library/archive work).
try {
  if (!window.location.hash || window.location.hash === "#/") {
    const saved = localStorage.getItem("sphenpad-last-route-v1")?.trim() ?? "";
    const path = saved.split(/[?#]/, 1)[0];
    if (path === "/folders" || path === "/archive" || path === "/creator" || path.startsWith("/p/") || path.startsWith("/creator/")) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${saved}`);
    }
  }
} catch {
  // Keep the root route when browser storage/history is unavailable.
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "SPHENPAD_REFRESH_OFFLINE_ARCHIVE" });
      })
      .catch(() => undefined);
  });
}

if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => false);
}
