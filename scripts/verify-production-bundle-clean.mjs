import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../dist/", import.meta.url);
const rootPath = root.pathname;
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const s = await stat(path);
    if (s.isDirectory()) out.push(...await walk(path)); else out.push(path);
  }
  return out;
}
const files = await walk(rootPath);
if (!files.length) throw new Error("dist/ is empty");
const rel = files.map((p) => relative(rootPath, p).replaceAll("\\", "/"));
const forbiddenPaths = rel.filter((p) => /(^|\/)(reports|tests|conformance-artifacts|scripts)(\/|$)/i.test(p) || /\.(map|py|ts|tsx|md)$/i.test(p));
if (forbiddenPaths.length) throw new Error(`Forbidden release artifacts: ${forbiddenPaths.join(", ")}`);
const forbiddenText = ["__phase9Render", "[PuzzlePage]", "[MainMenu]", "[FoldersPage]", "[CtCArchivePage]", "SUDOKUPAD_PHASE9", "SUDOKUPAD_PHASE10"];
const leaks = [];
for (const path of files) {
  if (!/\.(html|js|css|json)$/i.test(path)) continue;
  const text = await readFile(path, "utf8");
  for (const token of forbiddenText) if (text.includes(token)) leaks.push(`${relative(rootPath, path)}:${token}`);
}
if (leaks.length) throw new Error(`Debug/conformance text leaked into production bundle: ${leaks.join(", ")}`);
console.log(`Production bundle cleanliness: PASS (${files.length} files, no test/debug/conformance leakage)`);
