import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./app/styles.css";

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
