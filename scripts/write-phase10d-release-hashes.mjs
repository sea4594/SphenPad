import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const s = await stat(path);
    if (s.isDirectory()) out.push(...await walk(path)); else out.push(path);
  }
  return out;
}
async function hashFiles(paths) {
  const out = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    out.push({ path: relative(repo, path).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) });
  }
  return out.sort((a,b)=>a.path.localeCompare(b.path));
}
const productionInputs = [];
for (const base of ["src", "public", "edge"]) productionInputs.push(...await walk(join(repo, base)));
for (const name of ["package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "eslint.config.js"]) productionInputs.push(join(repo, name));
const distDir = join(repo, "dist");
const distFiles = await walk(distDir);
const manifest = {
  generatedAt: new Date().toISOString(),
  target: "SudokuPad 0.612.0",
  productionInputs: await hashFiles(productionInputs),
  productionBundle: await hashFiles(distFiles),
};
const canonical = JSON.stringify({target:manifest.target,productionInputs:manifest.productionInputs,productionBundle:manifest.productionBundle});
manifest.releaseContentSha256 = sha256(Buffer.from(canonical));
await mkdir(join(repo, "reports"), { recursive: true });
await writeFile(join(repo, "reports/sudokupad-phase10d-release-hashes.json"), JSON.stringify(manifest, null, 2)+"\n");
console.log(`Release hash manifest: PASS (${manifest.productionInputs.length} inputs, ${manifest.productionBundle.length} built files)`);
console.log(`releaseContentSha256=${manifest.releaseContentSha256}`);
