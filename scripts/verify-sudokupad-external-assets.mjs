import fs from "node:fs";
import process from "node:process";

const data = JSON.parse(fs.readFileSync("reports/sudokupad-phase10a-external-assets.json", "utf8"));
const timeoutMs = Number(process.env.SUDOKUPAD_ASSET_VERIFY_TIMEOUT_MS || 15000);
const maxAttempts = Math.max(1, Number(process.env.SUDOKUPAD_ASSET_VERIFY_ATTEMPTS || 3));
const retryDelayMs = Number(process.env.SUDOKUPAD_ASSET_VERIFY_RETRY_DELAY_MS || 1000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isNetworkOnlyFailure = error => {
  const msg = String(error || "").toLowerCase();
  return msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("econn") || msg.includes("enotfound") || msg.includes("eai_again") || msg.includes("network");
};

let failures = 0;
let baselineFallbacks = 0;
for (const entry of data.externalBackgrounds) {
  let success = false;
  let lastError = "unknown error";
  let lastFailureKind = "network";

  for (let attempt = 1; attempt <= maxAttempts && !success; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
    try {
      const response = await fetch(entry.url, { signal: controller.signal, redirect: "follow" });
      const mime = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      if (!response.ok || !mime.startsWith("image/")) {
        lastFailureKind = "content";
        lastError = `${response.status} ${mime || "unknown"}`;
      } else {
        const bytes = await response.arrayBuffer();
        const baseline = entry.verifiedBaseline;
        if (!bytes.byteLength) {
          lastFailureKind = "content";
          lastError = "empty response";
        } else if (baseline && (bytes.byteLength !== baseline.bytes || mime !== baseline.mime)) {
          lastFailureKind = "content";
          lastError = `content changed: expected ${baseline.bytes} bytes ${baseline.mime}, got ${bytes.byteLength} bytes ${mime}`;
        } else {
          const retryNote = attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : "";
          console.log(`OK   ${entry.puzzle.padEnd(20)} ${String(bytes.byteLength).padStart(8)} bytes ${mime} ${response.url}${retryNote}`);
          success = true;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      lastFailureKind = isNetworkOnlyFailure(lastError) ? "network" : "content";
    } finally {
      clearTimeout(timer);
    }

    if (!success && attempt < maxAttempts && lastFailureKind === "network") {
      console.warn(`RETRY ${entry.puzzle} ${lastError} (${attempt}/${maxAttempts}) ${entry.url}`);
      await sleep(retryDelayMs * attempt);
    } else if (!success && lastFailureKind !== "network") {
      break;
    }
  }

  if (!success) {
    if (lastFailureKind === "network" && entry.verifiedBaseline) {
      baselineFallbacks += 1;
      console.warn(`WARN ${entry.puzzle} live host unavailable after ${maxAttempts} attempts; accepting previously verified baseline from ${entry.verifiedBaseline.checkedAt} (${entry.verifiedBaseline.bytes} bytes ${entry.verifiedBaseline.mime}) ${entry.url}`);
    } else {
      failures += 1;
      console.error(`FAIL ${entry.puzzle} ${lastError} ${entry.url}`);
    }
  }
}

if (baselineFallbacks) console.warn(`External asset verification used ${baselineFallbacks} previously verified baseline fallback(s) due to live network unavailability.`);
if (failures) process.exitCode = 1;
