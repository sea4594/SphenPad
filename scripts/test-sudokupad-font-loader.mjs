import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sphenpad-font-loader-"));
const typeRoots = path.join(tmp, "types");
const outDir = path.join(tmp, "out");
fs.mkdirSync(typeRoots, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
try {
  execFileSync("tsc", [
    "src/sudokupad/assets/fontLoader.ts",
    "src/sudokupad/assets/assetResolver.ts",
    "src/sudokupad/assets/fontRegistry.ts",
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--lib", "ES2022,DOM",
    "--skipLibCheck",
    "--typeRoots", typeRoots,
    "--rootDir", "src/sudokupad",
    "--outDir", outDir,
  ], { stdio: "pipe" });

  const faces = [];
  class MockFontFace {
    constructor(family, source) { this.family = family; this.source = source; faces.push(this); }
    async load() {
      if (this.source.includes("Bauble_Monogram.ttf")) throw new Error("local font missing");
      return this;
    }
  }
  globalThis.FontFace = MockFontFace;
  const fontSet = {
    added: [], deleted: [],
    check: () => false,
    add(face) { this.added.push(face); },
    delete(face) { this.deleted.push(face); return true; },
  };
  globalThis.document = { fonts: fontSet };

  const require = createRequire(import.meta.url);
  const { ensureSudokuPadPuzzleFont } = require(path.join(outDir, "assets/fontLoader.js"));
  let remoteCalls = 0;
  const resolver = {
    async createObjectUrl(input, kind) {
      remoteCalls += 1;
      assert.equal(input, "/assets/fonts/Bauble_Monogram.ttf");
      assert.equal(kind, "font");
      return { url: "blob:remote-bauble", revoke() {} };
    },
  };
  await ensureSudokuPadPuzzleFont("baublemonogram", resolver);
  assert.equal(remoteCalls, 1, "missing local font should use resolver fallback");
  assert.equal(faces[0].source, "url(/assets/fonts/Bauble_Monogram.ttf)");
  assert.equal(faces[1].source, "url(blob:remote-bauble)");
  assert.equal(fontSet.deleted.length, 1, "failed local FontFace should be removed");

  let localOnlyRemoteCalls = 0;
  await ensureSudokuPadPuzzleFont("bonnet", {
    async createObjectUrl() { localOnlyRemoteCalls += 1; throw new Error("should not be used"); },
  });
  assert.equal(localOnlyRemoteCalls, 0, "successful local font should not use remote resolver");
  assert.equal(faces.at(-1).source, "url(/assets/fonts/Bonnet__.ttf)");

  console.log("SudokuPad font loader tests: PASS");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
