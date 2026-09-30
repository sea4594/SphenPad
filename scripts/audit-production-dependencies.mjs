import fs from "node:fs";
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

let audit;
try {
  audit = JSON.parse(result.stdout || "{}");
} catch {
  console.error("Could not parse npm audit JSON.");
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  process.exit(1);
}

const vulnerabilities = audit.vulnerabilities ?? {};
const names = Object.keys(vulnerabilities);

if (result.status === 0 && names.length === 0) {
  console.log("found 0 vulnerabilities");
  process.exit(0);
}

/*
 * Temporary, narrow exception for:
 *   firebase -> @firebase/firestore -> @grpc/grpc-js
 *
 * Firestore currently pins @grpc/grpc-js to ~1.9.0. For browser apps this
 * dependency is not the Firestore transport used at runtime; WebChannel is.
 *
 * Fail closed if:
 * - any other vulnerable package appears,
 * - any other advisory appears,
 * - grpc becomes a direct dependency, or
 * - Firestore changes/removes the exact dependency pin.
 *
 * Remove this exception when Firebase widens/updates the grpc dependency.
 * Upstream: https://github.com/firebase/firebase-js-sdk/issues/10400
 */
const allowedPackages = new Set([
  "@grpc/grpc-js",
  "@firebase/firestore",
  "@firebase/firestore-compat",
  "firebase",
]);

const allowedAdvisories = new Set([
  "GHSA-m9gg-hp2v-232j",
  "GHSA-f596-whhp-79r4",
]);

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

if (packageJson.dependencies?.["@grpc/grpc-js"]) {
  console.error("FAIL: @grpc/grpc-js is now a direct production dependency.");
  process.exit(1);
}

const firestoreGrpc =
  packageLock.packages?.["node_modules/@firebase/firestore"]?.dependencies?.["@grpc/grpc-js"];

if (firestoreGrpc !== "~1.9.0") {
  console.error(
    `FAIL: Firestore grpc dependency changed (${JSON.stringify(firestoreGrpc)}); ` +
    "remove/reassess the temporary audit exception."
  );
  process.exit(1);
}

function directAdvisoryAllowed(via) {
  const text = JSON.stringify(via);
  const ids = [...text.matchAll(/GHSA-[0-9a-z-]+/gi)].map((match) =>
    match[0].toLowerCase()
  );
  if (!ids.length) return false;
  return ids.every((id) =>
    [...allowedAdvisories].some((allowed) => allowed.toLowerCase() === id)
  );
}

function vulnerabilityAllowed(name, stack = new Set()) {
  if (!allowedPackages.has(name)) return false;
  if (stack.has(name)) return false;

  const entry = vulnerabilities[name];
  if (!entry) return false;

  const next = new Set(stack);
  next.add(name);

  for (const via of entry.via ?? []) {
    if (typeof via === "string") {
      if (!vulnerabilityAllowed(via, next)) return false;
    } else if (!directAdvisoryAllowed(via)) {
      return false;
    }
  }
  return true;
}

const unexpected = names.filter((name) => !vulnerabilityAllowed(name));

if (unexpected.length) {
  console.error(
    "FAIL: npm audit found production vulnerabilities outside the narrow " +
    "Firebase browser-only grpc exception:"
  );
  for (const name of unexpected) console.error(`  - ${name}`);

  spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high"], {
    stdio: "inherit",
  });
  process.exit(1);
}

console.log(
  "npm audit: only the known Firebase/Firestore browser-only grpc advisories " +
  "are present; temporary fail-closed exception accepted."
);
