import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile, access } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
const repo = resolve(new URL("..", import.meta.url).pathname);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function walk(dir) { const out=[]; for (const name of await readdir(dir)) { const path=join(dir,name), s=await stat(path); if (s.isDirectory()) out.push(...await walk(path)); else out.push(path); } return out; }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function hashFiles(paths) { const out=[]; for (const path of paths) { const bytes=await readFile(path); out.push({path:relative(repo,path).replaceAll("\\","/"),bytes:bytes.length,sha256:sha256(bytes)}); } return out.sort((a,b)=>a.path.localeCompare(b.path)); }
const inputs=[];
for (const base of ["src","public","edge"]) inputs.push(...await walk(join(repo,base)));
for (const name of ["package.json","package-lock.json","index.html","vite.config.ts","tsconfig.json","tsconfig.app.json","tsconfig.node.json","eslint.config.js"]) { const p=join(repo,name); if (await exists(p)) inputs.push(p); }
const creatorTests=(await readdir(join(repo,"scripts"))).filter((name)=>name.startsWith("test-creator-") && (name.endsWith(".ts")||name.endsWith(".mjs"))).map((name)=>join(repo,"scripts",name));
const productionInputs=await hashFiles(inputs), creatorTestInputs=await hashFiles(creatorTests);
const distDir=join(repo,"dist"), productionBundle=await exists(distDir)?await hashFiles(await walk(distDir)):[];
const manifest={generatedAt:new Date().toISOString(),phase:"11L",target:"SphenPad Phase 11 / SudokuMaker creator parity on pinned SudokuPad 0.612.0",productionInputs,creatorTestInputs,productionBundle,bundleBuilt:productionBundle.length>0};
const canonical=JSON.stringify({phase:manifest.phase,target:manifest.target,productionInputs,creatorTestInputs,productionBundle});
manifest.releaseContentSha256=sha256(Buffer.from(canonical));
await mkdir(join(repo,"reports"),{recursive:true});
await writeFile(join(repo,"reports/sphenpad-phase11-release-hashes.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(`Phase 11 release hash manifest: PASS (${productionInputs.length} production inputs, ${creatorTestInputs.length} creator tests, ${productionBundle.length} built files)`);
console.log(`releaseContentSha256=${manifest.releaseContentSha256}`);
