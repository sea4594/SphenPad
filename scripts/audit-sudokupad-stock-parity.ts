import { STOCK_FEATURE_PARITY, stockFeatureParityFailures } from "../src/sudokupad/parity/stockFeatureManifest";

const failures = stockFeatureParityFailures();
const authored = STOCK_FEATURE_PARITY.filter((entry) => entry.affectsAuthoredPuzzleSvg);
const excluded = STOCK_FEATURE_PARITY.filter((entry) => entry.category === "unbounded-plugin");

console.log(`Captured stock feature modules: ${STOCK_FEATURE_PARITY.length}`);
console.log(`Feature modules capable of affecting puzzle SVG: ${authored.length}`);
console.log(`Finite authored-render gaps: ${failures.length}`);
if (excluded.length) console.log(`Explicit unbounded plugin boundary: ${excluded.map((entry) => entry.feature).join(", ")}`);
for (const failure of failures) console.error(`MISSING ${failure.file}: ${failure.note}`);
if (failures.length) process.exitCode = 1;
