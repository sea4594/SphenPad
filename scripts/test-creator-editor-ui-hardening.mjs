import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const editor = read("src/ui/PuzzleEditorPage.tsx");
const worker = read("src/sudokupad/creator/solver.worker.ts");
const css = read("src/ui/CreatorEditorUx.css");
const player = read("src/ui/PuzzlePage.tsx");

// These checks guard the actual controls and their result placement, not just names in a catalog.
assert.match(player, /aria-label="Back"/);
assert.match(editor, /aria-label="Back" title="Back to Puzzle Creator">←<\/button>/);
assert.doesNotMatch(editor, />Inspect components<\/button>/);
assert.doesNotMatch(editor, /Saving…<\/span>|>Saved<\/span>/);
assert.match(editor, /saveStatus\.error \? <button/); // Failure recovery remains accessible.
assert.match(editor, /creatorTab === "tools" \? <aside className="creatorInspector card creatorSolverInspector"/);
assert.match(editor, /\{renderCreatorSolverPanel\(\)\}/);
assert.match(editor, /<CreatorLogicalWalkthrough/);
assert.match(editor, /solutionSearch\.solutions\.map/);
assert.match(editor, /creatorSolverFeedback.*solverBusy/);
assert.match(editor, /onClick=\{cancelCreatorSolver\}/);
assert.match(editor, /function runWorkerValidation\(source: "givens" \| "solution"/);
assert.match(editor, /runCreatorSolverTask\("validate", "unique", source\)/);
assert.match(editor, /worker\.onerror/);
assert.match(editor, /catch \(error\) \{/);
assert.doesNotMatch(editor, /className="creatorCanvasToolbar"/); // Fit stays off the board.
assert.match(css, /\.creatorEditorShell \.creatorEditorTopbar \{ width: 100%/);
assert.match(css, /\.creatorEditorShell \.creatorSolverInspector/);
assert.match(css, /prefers-reduced-motion: reduce/);

// Execute the actual creator worker's message handler with mocked mathematical routines.
// This catches broken action routing even when browser dependencies are unavailable.
const posted = [];
const mockSelf = { postMessage(value) { posted.push(value); } };
const mockSolver = {
  solveCreatorLogically: () => ({ status: "stuck", steps: [], message: "no technique" }),
  findCreatorSolutions: (_def, _settings, options) => {
    options.onProgress({ nodes: 2, solutionsFound: 1 });
    return { status: "multiple", nodes: 2, solutionsFound: 2, solutions: [] };
  },
};
const mockValidation = {
  validateGrid: (_def, values) => ({ invalidCells: values.length ? [] : [{ r: 0, c: 0 }], diagnostics: [], thrownErrors: [] }),
  validateConstraints: () => new Map([["bad", "invalid"]]),
  workerValuesFromDefinition: (_def, source) => source === "solution" ? [{ rc: { r: 0, c: 0 }, value: 1 }] : [],
};
const js = ts.transpileModule(worker, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ctx = { self: mockSelf, exports: {}, require(specifier) {
  if (specifier === "./solver") return mockSolver;
  if (specifier === "./worker") return mockValidation;
  throw new Error(`Unexpected worker dependency: ${specifier}`);
} };
vm.runInNewContext(js, ctx, { filename: "solver.worker.js", timeout: 1000 });
assert.equal(typeof mockSelf.onmessage, "function");
mockSelf.onmessage({ data: { action: "validate", source: "solution", def: {} } });
assert.equal(posted.at(-1).action, "validate");
assert.equal(posted.at(-1).result.invalidCells.length, 0);
assert.equal(posted.at(-1).constraintErrors[0].id, "bad");
posted.length = 0;
mockSelf.onmessage({ data: { action: "search", def: {}, settings: {} } });
assert.deepEqual(posted.map((p) => p.action), ["progress", "search"]);
posted.length = 0;
mockSelf.onmessage({ data: { action: "logical", def: {}, settings: {} } });
assert.equal(posted.at(-1).action, "logical");
console.log("creator UI hardening and worker message-flow checks passed");
