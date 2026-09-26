import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const dist = path.resolve("dist");
const index = path.join(dist, "index.html");
if (!fs.existsSync(index)) {
  console.error("Production smoke: dist/index.html is missing. Run npm build first.");
  process.exit(1);
}
const html = fs.readFileSync(index, "utf8");
if (!/<div[^>]+id=["']root["']/i.test(html)) throw new Error("Production smoke: root mount is missing from dist/index.html");
const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]).filter((ref) => ref.startsWith("/assets/") || ref.startsWith("./assets/") || ref.startsWith("assets/"));
for (const ref of refs) {
  const relative = ref.replace(/^\.\//, "").replace(/^\//, "");
  const file = path.join(dist, relative);
  if (!fs.existsSync(file)) throw new Error(`Production smoke: referenced asset is missing: ${ref}`);
}
console.log(`Production smoke: PASS (${refs.length} built asset references checked)`);
