function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";
import { addCreatorGlobalConstraint, setCreatorSudokuRules } from "../src/sudokupad/creator/globalConstraints";
import { getCellsSeenByCells, getComponents, validateConstraints, validateGrid, workerValuesFromDefinition } from "../src/sudokupad/creator/worker";
import { findCreatorSolutions, solveCreatorLogically } from "../src/sudokupad/creator/solver";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";

const c=(r:number,col:number):CellRC=>({r,c:col});
function base(size=4):PuzzleDefinition { return createAuthoredPuzzleDefinition({id:`h-${size}`,rows:size,cols:size,subgrid:size===4?{r:2,c:2}:{r:3,c:3},digitRange:{min:1,max:size},meta:{}}); }
function withValues(def:PuzzleDefinition, values:Array<[CellRC,number]>):PuzzleDefinition { return {...def,givens:values.map(([rc,value])=>({rc,v:String(value)}))}; }

// getComponents exposes Sudoku houses plus first-class semantic components.
let def=base();
let components=getComponents(def); equal(components.filter(x=>x.type==="House").length,12); ok(components.some(x=>x.name==="row 1"));
let made=addCreatorGroupConstraint(def,"different-values",[c(0,0),c(2,2)]); def=made.def; components=getComponents(def); ok(components.some(x=>x.constraintId===made.constraintId&&x.exclusion));

// getCellsSeenByCells returns the upstream-style intersection and propagates clone equivalence.
let seen=getCellsSeenByCells(base(),[c(0,0)]); ok(seen.some(x=>x.r===0&&x.c===3)); ok(seen.some(x=>x.r===1&&x.c===1)); ok(!seen.some(x=>x.r===3&&x.c===3));
seen=getCellsSeenByCells(base(),[c(0,0),c(0,1)]); ok(seen.some(x=>x.r===0&&x.c===2)); ok(!seen.some(x=>x.r===2&&x.c===0));
made=addCreatorGroupConstraint(base(),"clones",[c(0,0),c(3,3)]); seen=getCellsSeenByCells(made.def,[c(0,0)]); ok(seen.some(x=>x.r===3&&x.c===2),"clone should inherit seen cells from its equivalent");

// validateConstraints reports malformed configuration by id rather than grid values.
made=addCreatorGroupConstraint(base(),"difference-kropki",[c(0,0),c(2,2)]); const constraintErrors=validateConstraints(made.def); ok((constraintErrors.get(made.constraintId)??"").includes("orthogonally adjacent"));

// validateGrid returns exact invalid cells and constraint diagnostics.
def=withValues(base(),[[c(0,0),1],[c(0,1),1]]); let report=validateGrid(def); equal(report.invalidCells.length,2); ok(report.diagnostics.some(d=>d.code==="duplicate"));
made=addCreatorGroupConstraint(setCreatorSudokuRules(base(),false),"difference-kropki",[c(0,0),c(0,1)]); def=withValues(made.def,[[c(0,0),1],[c(0,1),3]]); report=validateGrid(def); ok(report.diagnostics.some(d=>d.constraintId===made.constraintId&&d.code==="difference"));
made=addCreatorGlobalConstraint(base(),"custom-constraint",[c(0,0)]); report=validateGrid(made.def); ok(report.thrownErrors.some(message=>message.includes("not executed")));

// Solver settings persist through the CreatorProject bridge.
def=base(); def={...def,meta:{...def.meta,creatorSolverSettings:{maxSolutions:3,maxNodes:12345,logicalStepLimit:77}}}; const project=creatorProjectFromDefinition(def); equal(project.settings.solver?.maxSolutions,3); const roundTrip=definitionFromCreatorProject(project); equal(roundTrip.meta.creatorSolverSettings?.maxNodes,12345); equal(roundTrip.meta.creatorSolverSettings?.logicalStepLimit,77);

// Solution values can be sent through the same worker API.
def=base(); def={...def,logic:{...(def.logic??{}),creatorSolutionEntries:[{rc:c(0,0),value:"1"},{rc:c(0,1),value:"2"}]}}; equal(workerValuesFromDefinition(def,"solution").length,2);

// Logical solver performs deterministic singles and returns the filled grid.
const solution=[[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
const almost:Array<[CellRC,number]>=[]; for(let r=0;r<4;r++)for(let col=0;col<4;col++)if(!(r===3&&col===2))almost.push([c(r,col),solution[r][col]]);
def=withValues(base(),almost); const logical=solveCreatorLogically(def); equal(logical.status,"solved"); equal(logical.steps.length,1); equal(logical.steps[0].value,2);

// Solution finder proves the same near-complete puzzle unique and detects multiple solutions.
let search=findCreatorSolutions(def,{maxSolutions:2,maxNodes:5000}); equal(search.status,"solved"); equal(search.solutions.length,1); equal(search.solutions[0].length,16);
search=findCreatorSolutions(base(),{maxSolutions:2,maxNodes:10000}); equal(search.status,"multiple"); equal(search.solutions.length,2);

// Invalid givens and executable custom code stop solving instead of being ignored.
def=withValues(base(),[[c(0,0),1],[c(0,1),1]]); search=findCreatorSolutions(def); equal(search.status,"invalid");
made=addCreatorGlobalConstraint(base(),"custom-constraint",[c(0,0)]); search=findCreatorSolutions(made.def); equal(search.status,"unsupported");

console.log("creator worker/solver tests passed");
