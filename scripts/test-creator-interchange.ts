function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";
import { addCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";
import { addCreatorGlobalConstraint } from "../src/sudokupad/creator/globalConstraints";
import { creatorProjectFromDefinition } from "../src/sudokupad/creator/project";
import { compressPuzzleBase64 } from "../src/sudokupad/codecs/base64Puzzle";
import { parseResolvedSudokuPadPayload } from "../src/sudokupad/loader/puzzleData";
import { authoredPuzzleJson, creatorProjectJson, exportCreatorInterchange, importCreatorInterchange } from "../src/sudokupad/creator/interchange";


async function main() {
  const c=(r:number,col:number):CellRC=>({r,c:col});
  function base():PuzzleDefinition { return createAuthoredPuzzleDefinition({id:"i-4",rows:4,cols:4,subgrid:{r:2,c:2},digitRange:{min:1,max:4},meta:{title:"Phase 11I",author:"SphenPad",rules:"Test rules",postSolveMessage:"Done"}}); }
  function containsCreatorTag(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsCreatorTag); if (value && typeof value === "object") return Object.entries(value as Record<string,unknown>).some(([k,v])=>k.startsWith("data-sphenpad-") || containsCreatorTag(v)); return false; }

  let def=base();
  def={...def,givens:[{rc:c(0,0),v:"1"},{rc:c(1,1),v:"4"}],logic:{...(def.logic??{}),solution:"1234341221434321"}};
  def=addCreatorLineConstraint(def,"thermometers",[c(0,0),c(0,1),c(0,2)]).def;
  def=addCreatorGroupConstraint(def,"killer-cages",[c(2,0),c(2,1)],"5").def;
  def=addCreatorGlobalConstraint(def,"positive-diagonal").def;
  let exported=exportCreatorInterchange(def);
  ok(exported.scl.startsWith("scl")); ok(exported.sudokuPadUrl.startsWith("https://sudokupad.app/scl")); ok(!containsCreatorTag(exported.sourcePuzzle),"SCL export leaked creator-only tags");
  const parsed=parseResolvedSudokuPadPayload(exported.scl); ok(parsed.sourcePuzzle); equal(String(parsed.sourcePuzzle?.metadata?.title),"Phase 11I"); equal(String(parsed.sourcePuzzle?.cells[0]?.[0]?.value),"1");

  let imported=await importCreatorInterchange(exported.scl,{id:"target",sourceId:"target"}); equal(imported.def.id,"target"); equal(imported.def.rows,4); equal(imported.def.givens.length,2); ok(imported.report.issues.some(i=>i.code==="semantic-inference")); ok((imported.def.logic?.constraints??[]).some(x=>x.type==="killer-cage"));

  const projectJson=creatorProjectJson(def); imported=await importCreatorInterchange(projectJson,{id:"project-target",sourceId:"project-target"}); equal(imported.report.format,"creator-project"); equal((imported.def.logic?.constraints??[]).length,(def.logic?.constraints??[]).length); equal(imported.def.id,"project-target");
  const authoredJson=authoredPuzzleJson(def); imported=await importCreatorInterchange(authoredJson,{id:"authored-target",sourceId:"authored-target"}); equal(imported.report.format,"sphenpad-authored"); equal(imported.def.givens.length,2);

  const fpuzzle={size:4,title:"FP import",author:"Tester",ruleset:"Classic",antiknight:true,nonconsecutive:true,grid:[
    [{value:1,given:true,region:0},{region:0},{region:1},{region:1}],
    [{region:0},{region:0},{region:1},{region:1}],
    [{region:2},{region:2},{region:3},{region:3}],
    [{region:2},{region:2},{region:3},{region:3}],
  ],thermometer:[{lines:[["R1C1","R1C2","R1C3"]]}],difference:[{cells:["R2C1","R2C2"],value:1}],killercage:[{cells:["R3C1","R3C2"],value:"5"}],quadruple:[{cells:["R1C1","R1C2","R2C1","R2C2"],values:[1,2]}],mysteryFeature:[{cell:"R4C4"}]};
  imported=await importCreatorInterchange(JSON.stringify(fpuzzle),{id:"fp-raw",sourceId:"fp-raw"}); equal(imported.report.format,"fpuzzles"); equal(imported.def.givens[0]?.v,"1"); ok(imported.def.logic?.antiKnight===true); ok((imported.def.logic?.constraints??[]).some(x=>x.type==="thermometer")); ok((imported.def.logic?.constraints??[]).some(x=>x.type==="difference")); ok((imported.def.logic?.constraints??[]).some(x=>x.type==="quadruple")); ok(imported.report.issues.some(i=>i.code==="unsupported-fpuzzles-key" && i.path==="mysteryFeature"));
  const fpuz=`fpuz${compressPuzzleBase64(JSON.stringify(fpuzzle))}`; imported=await importCreatorInterchange(fpuz,{id:"fp-encoded",sourceId:"fp-encoded"}); equal(imported.report.format,"fpuzzles"); ok((imported.def.logic?.constraints??[]).some(x=>x.type==="thermometer"),"encoded F-Puzzles should preserve semantic reconstruction");

  const rawSource=JSON.stringify(exported.sourcePuzzle); imported=await importCreatorInterchange(rawSource,{id:"source-json",sourceId:"source-json"}); equal(imported.report.format,"sudokupad-json"); equal(imported.def.rows,4);

  const custom=addCreatorGlobalConstraint(base(),"custom-constraint",[c(0,0)]).def; exported=exportCreatorInterchange(custom); ok(exported.report.issues.some(i=>i.code==="custom-runtime-not-exported"&&i.severity==="loss"));

  const project=creatorProjectFromDefinition(def); ok(project.constraints.length>=3); console.log("creator interchange tests passed");
}
void main().catch((error) => { console.error(error); throw error; });
