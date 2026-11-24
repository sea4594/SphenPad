import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition, addCreatorConstraint } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";
import { getComponents, getCellsSeenByCells } from "../src/sudokupad/creator/worker";
import { findCreatorSolutions, solveCreatorLogically } from "../src/sudokupad/creator/solver";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const rc=(r:number,c:number):CellRC=>({r,c});
function base():PuzzleDefinition { return createAuthoredPuzzleDefinition({id:"phase3-test",rows:4,cols:4,subgrid:{r:2,c:2},digitRange:{min:1,max:4},meta:{}}); }
const solved=[[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
const givens=(def:PuzzleDefinition,except: Array<[number,number]> = []) => ({...def,givens:solved.flatMap((row,r)=>row.flatMap((value,c)=>except.some(([er,ec])=>er===r&&ec===c)?[]:[{rc:rc(r,c),v:String(value)}]))});

// A cap of ONE is not permission to call the first found solution "unique".
let result=findCreatorSolutions(base(),{maxSolutions:1,maxNodes:20000});
assert(result.status==="limit" && result.solutions.length===1 && /not proven/.test(result.message??""), "one returned solution must not imply unique");
result=findCreatorSolutions(base(),{maxSolutions:2,maxNodes:20000});
assert(result.status==="multiple" && result.solutions.length===2, "two solutions prove nonuniqueness");
result=findCreatorSolutions(givens(base(),[[3,2]]),{maxSolutions:1,maxNodes:100});
assert(result.status==="solved" && result.solutions.length===1, "exhaustive unique case should be proven, even with cap 1");
result=findCreatorSolutions(base(),{maxSolutions:2,maxNodes:1});
assert(result.status==="limit" && result.solutions.length===0, "no result before node limit is not unsolvable");

// Valid givens that rule out the only remaining row digit must prove zero solutions.
const impossible={...base(),givens:[{rc:rc(0,0),v:"1"},{rc:rc(0,1),v:"2"},{rc:rc(0,2),v:"3"},{rc:rc(1,3),v:"4"}]};
result=findCreatorSolutions(impossible,{maxSolutions:2,maxNodes:5000});
assert(result.status==="none" && result.solutions.length===0, `expected proof of no solutions, got ${result.status}: ${result.message}`);

// Enabled semantic constraints must not be silently ignored.
let withUnknown=addCreatorConstraint(base(),{type:"new-rule-not-understood",sourceElementId:"new-rule",cells:[rc(0,0)]});
result=findCreatorSolutions(withUnknown);
assert(result.status==="unsupported" && /new-rule/.test(result.message??""), "unknown enabled rule must report unsupported");
withUnknown={...withUnknown,logic:{...withUnknown.logic,constraints:withUnknown.logic?.constraints?.map(c=>({...c,enabled:false}))}};
result=findCreatorSolutions(withUnknown,{maxSolutions:2,maxNodes:5000});
assert(result.status==="multiple", "disabled unknown rule must not block solving");

const withClone=addCreatorGroupConstraint(base(),"clones",[rc(0,0),rc(0,2)]);
const checkedClone=givens(withClone.def,[[3,2]]);
result=findCreatorSolutions(checkedClone);
assert(result.status==="invalid", "active violated clone must invalidate givens");
const unchecked={...checkedClone,meta:{...checkedClone.meta,creatorConstraintChecks:{...checkedClone.meta.creatorConstraintChecks,"clones":false}}};
result=findCreatorSolutions(unchecked);
assert(result.status==="solved", `disabled clone must not influence solution search: ${result.status}`);
const seen=getCellsSeenByCells(unchecked,[rc(0,0)]);
assert(!seen.some(c=>c.r===2&&c.c===2), "disabled clone must not create remote seen cells");
assert(!getComponents(unchecked).some(c=>c.constraintId===withClone.constraintId), "disabled clone must not create an exclusion component");
const logically=solveCreatorLogically(unchecked);
assert(logically.status==="solved", "logical solver must honor disabled constraints");

console.log("creator Phase 3 solver safety tests passed");
