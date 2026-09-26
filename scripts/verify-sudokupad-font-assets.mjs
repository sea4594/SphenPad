import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "scripts/data/sudokupad-font-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requireAll = process.argv.includes("--require-all");
const updateHashes = process.argv.includes("--update-hashes");
let failed = false;
let changed = false;

for (const font of manifest.fonts) {
  const filename = path.join(root, "public/assets/fonts", font.file);
  if (!fs.existsSync(filename)) {
    console.log(`MISSING  ${font.id.padEnd(21)} ${font.file}`);
    if (requireAll) failed = true;
    continue;
  }
  const bytes = fs.readFileSync(filename);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const ext = path.extname(font.file).toLowerCase();
  const signature = bytes.subarray(0, 4).toString("hex");
  const plausible = ext === ".otf" ? signature === "4f54544f" : ["00010000", "74727565", "74797031", "4f54544f"].includes(signature);
  if (!plausible) {
    console.error(`INVALID  ${font.id.padEnd(21)} ${font.file} (unexpected sfnt signature ${signature})`);
    failed = true;
    continue;
  }
  if (font.sha256 && font.sha256.toLowerCase() !== hash) {
    console.error(`HASHERR  ${font.id.padEnd(21)} expected=${font.sha256} actual=${hash}`);
    failed = true;
    continue;
  }
  if (updateHashes && font.sha256 !== hash) {
    font.sha256 = hash;
    changed = true;
  }
  console.log(`OK       ${font.id.padEnd(21)} ${bytes.length.toString().padStart(8)} bytes sha256=${hash}`);
}

if (updateHashes && changed) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${path.relative(root, manifestPath)}`);
}
if (failed) process.exitCode = 1;
