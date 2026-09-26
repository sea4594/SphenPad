import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../public/assets/sudokupad-compatibility-manifest.json", import.meta.url), "utf8"));
const manifestOnly = process.argv.includes("--manifest-only");
const harArgIndex = process.argv.indexOf("--har");
const harPath = harArgIndex >= 0 ? process.argv[harArgIndex + 1] : null;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (manifest.target !== "SudokuPad 0.612.0") throw new Error(`Unexpected target ${manifest.target}`);
if (!Array.isArray(manifest.webAssets) || manifest.webAssets.length < 1) throw new Error("No pinned web assets");
if (!Array.isArray(manifest.fonts) || manifest.fonts.length !== 13) throw new Error("Expected 13 pinned fonts");
for (const entry of [...manifest.webAssets, ...manifest.fonts]) {
  if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) throw new Error(`Invalid SHA-256 for ${entry.path ?? entry.file}`);
}
if (manifestOnly) {
  console.log(`SudokuPad compatibility manifest: PASS (${manifest.webAssets.length} JS/CSS assets, ${manifest.fonts.length} fonts)`);
  process.exit(0);
}

if (harPath) {
  const har = JSON.parse(await readFile(harPath, "utf8"));
  const byPath = new Map();
  for (const entry of har.log?.entries ?? []) {
    const url = new URL(entry.request.url);
    if (url.origin !== manifest.origin || byPath.has(url.pathname)) continue;
    const content = entry.response?.content ?? {};
    const bytes = content.encoding === "base64"
      ? Buffer.from(content.text ?? "", "base64")
      : Buffer.from(content.text ?? "", "utf8");
    byPath.set(url.pathname, sha256(bytes));
  }
  const failed = manifest.webAssets.filter((entry) => byPath.get(entry.path) !== entry.sha256);
  console.log(`Captured HAR target check: ${manifest.webAssets.length - failed.length}/${manifest.webAssets.length} pinned JS/CSS assets match.`);
  if (failed.length) {
    for (const entry of failed) console.log(`DRIFT/MISSING ${entry.path}`);
    process.exitCode = 1;
  }
  process.exit();
}

const entries = [
  ...manifest.webAssets.map((entry) => ({...entry, url: new URL(entry.path, manifest.origin).href, group: "web"})),
  ...manifest.fonts.map((entry) => ({...entry, url: new URL(entry.path, manifest.origin).href, group: "font"})),
];
let cursor = 0;
const results = [];
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(entry.url, { signal: controller.signal, redirect: "follow" });
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = sha256(bytes);
      const ok = response.ok && actual === entry.sha256;
      results.push({ path: entry.path ?? entry.file, group: entry.group, status: response.status, expected: entry.sha256, actual, ok });
      console.log(`${ok ? "PASS" : "DRIFT"} ${entry.path ?? entry.file}`);
    } catch (error) {
      results.push({ path: entry.path ?? entry.file, group: entry.group, error: error instanceof Error ? error.message : String(error), ok: false });
      console.log(`ERROR ${entry.path ?? entry.file}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { clearTimeout(timer); }
  }
}
await Promise.all(Array.from({ length: 8 }, () => worker()));
const failed = results.filter((result) => !result.ok);
console.log(`Checked ${results.length} pinned resources; ${failed.length} drift/error(s).`);
if (failed.length) process.exitCode = 1;
