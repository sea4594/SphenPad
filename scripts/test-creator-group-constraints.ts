function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGroupConstraint, formatDigitList, normalizeCreatorGroupConstraints, replaceCreatorGroupCells, updateCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";

function base(): PuzzleDefinition { return createAuthoredPuzzleDefinition({ id: "group", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, digitRange: { min: 1, max: 9 }, meta: {} }); }
function withValues(def: PuzzleDefinition, entries: Array<[CellRC, number]>): PuzzleDefinition { return { ...def, givens: entries.map(([rc, value]) => ({ rc, v: String(value) })) }; }
function add(def: PuzzleDefinition, id: Parameters<typeof addCreatorGroupConstraint>[1], cells: CellRC[], value = "") { return addCreatorGroupConstraint(def, id, cells, value); }
const a={r:0,c:0}, b={r:0,c:1}, c={r:1,c:0}, d={r:1,c:1};

let made = add(base(), "even", [a]); let def = withValues(made.def, [[a,3]]); ok(validateCreatorDefinition(def).includes("Even cell conflict."));
made = add(base(), "odd", [a]); def = withValues(made.def, [[a,4]]); ok(validateCreatorDefinition(def).includes("Odd cell conflict."));

made = add(base(), "minimum", [{r:4,c:4}]); def = withValues(made.def, [[{r:4,c:4},2],[{r:4,c:3},1]]); ok(validateCreatorDefinition(def).includes("Minimum cell conflict."));
made = add(base(), "maximum", [{r:4,c:4}]); def = withValues(made.def, [[{r:4,c:4},8],[{r:4,c:3},9]]); ok(validateCreatorDefinition(def).includes("Maximum cell conflict."));
let overlap = add(base(), "minimum", [{r:4,c:4}]).def; overlap = add(overlap, "maximum", [{r:4,c:4}]).def; ok(validateCreatorDefinition(overlap).includes("Minimum and maximum cells cannot overlap."));

made = add(base(), "difference-kropki", [a,b], "3"); equal(Number(creatorConstraints(made.def)[0].difference),3); def = withValues(made.def, [[a,1],[b,4]]); ok(!validateCreatorDefinition(def).some((m)=>m.startsWith("Difference dot conflict")));
def = withValues(made.def, [[a,1],[b,3]]); ok(validateCreatorDefinition(def).includes("Difference dot conflict (difference 3)."));
def = updateCreatorGroupConstraint(made.def, made.constraintId, { negativeValues: [1] }); def = withValues(def, [[a,1],[b,4],[{r:3,c:0},2],[{r:3,c:1},3]]); ok(validateCreatorDefinition(def).includes("Negative difference conflict (1)."));

made = add(base(), "ratio-kropki", [a,b], "3"); equal(Number(creatorConstraints(made.def)[0].ratio),3); def = withValues(made.def, [[a,1],[b,3]]); ok(!validateCreatorDefinition(def).some((m)=>m.startsWith("Ratio dot conflict")));
def = withValues(made.def, [[a,1],[b,2]]); ok(validateCreatorDefinition(def).includes("Ratio dot conflict (3:1)."));
def = updateCreatorGroupConstraint(made.def, made.constraintId, { negativeValues: [2] }); def = withValues(def, [[a,1],[b,3],[{r:3,c:0},2],[{r:3,c:1},4]]); ok(validateCreatorDefinition(def).includes("Negative ratio conflict (2:1)."));

// Cross-family override switches mirror SudokuMaker's negative Difference/Ratio options.
const cross = add(base(), "difference-kropki", [a,b], "1"); cross.def = updateCreatorGroupConstraint(cross.def, cross.constraintId, { negativeValues: [1] });
const ratio = add(cross.def, "ratio-kropki", [{r:3,c:0},{r:3,c:1}], "2"); cross.def = withValues(ratio.def, [[a,3],[b,4],[{r:3,c:0},1],[{r:3,c:1},2]]); ok(validateCreatorDefinition(cross.def).includes("Negative difference conflict (1)."));
cross.def = updateCreatorGroupConstraint(cross.def, ratio.constraintId, { overrideNegativeDifferences: true }); ok(!validateCreatorDefinition(cross.def).includes("Negative difference conflict (1)."));
const ratioNeg = add(base(), "ratio-kropki", [{r:3,c:0},{r:3,c:1}], "3"); ratioNeg.def = updateCreatorGroupConstraint(ratioNeg.def, ratioNeg.constraintId, { negativeValues: [2] });
const diff = add(ratioNeg.def, "difference-kropki", [a,b], "1"); ratioNeg.def = withValues(diff.def, [[a,1],[b,2],[{r:3,c:0},1],[{r:3,c:1},3]]); ok(validateCreatorDefinition(ratioNeg.def).includes("Negative ratio conflict (2:1)."));
ratioNeg.def = updateCreatorGroupConstraint(ratioNeg.def, diff.constraintId, { overrideNegativeRatios: true }); ok(!validateCreatorDefinition(ratioNeg.def).includes("Negative ratio conflict (2:1)."));

made = add(base(), "xv", [a,b], "V"); equal(Number(creatorConstraints(made.def)[0].sum),5); def = withValues(made.def, [[a,2],[b,3]]); ok(!validateCreatorDefinition(def).includes("V conflict."));
def = updateCreatorGroupConstraint(made.def, made.constraintId, { negativeValues: [5] }); def = withValues(def, [[a,2],[b,3],[{r:3,c:0},1],[{r:3,c:1},4]]); ok(validateCreatorDefinition(def).includes("Negative XV conflict (sum 5)."));

const cageCells=[a,b,{r:0,c:2}]; made=add(base(),"killer-cages",cageCells,"6"); def=withValues(made.def,[[a,1],[b,2],[{r:0,c:2},3]]); ok(!validateCreatorDefinition(def).includes("Killer cage sum conflict."));
def=withValues(made.def,[[a,1],[b,2],[{r:0,c:2},4]]); ok(validateCreatorDefinition(def).includes("Killer cage sum conflict."));
made=add(base(),"killer-cages",cageCells,""); def=withValues(made.def,[[a,1],[b,2],[{r:0,c:2},4]]); ok(!validateCreatorDefinition(def).includes("Killer cage sum conflict."));
def=withValues(made.def,[[a,1],[b,1],[{r:0,c:2},4]]); ok(validateCreatorDefinition(def).includes("Killer cage has repeated digits."));

const cloneCells=[{r:0,c:0},{r:4,c:4}]; made=add(base(),"clones",cloneCells); def=withValues(made.def,[[cloneCells[0],3],[cloneCells[1],3]]); ok(!validateCreatorDefinition(def).includes("Clone conflict.")); def=withValues(made.def,[[cloneCells[0],3],[cloneCells[1],4]]); ok(validateCreatorDefinition(def).includes("Clone conflict."));

made=add(base(),"quadruples",[a,b,c,d],"112"); equal(formatDigitList(creatorConstraints(made.def)[0].digits),"112"); def=withValues(made.def,[[a,1],[b,2],[c,3],[d,1]]); ok(!validateCreatorDefinition(def).includes("Quadruple conflict.")); def=withValues(made.def,[[a,1],[b,2],[c,3],[d,4]]); ok(validateCreatorDefinition(def).includes("Quadruple conflict."));

made=add(base(),"look-and-say-cages",[{r:0,c:0},{r:3,c:3},{r:6,c:6}],"1522"); def=withValues(made.def,[[{r:0,c:0},5],[{r:3,c:3},2],[{r:6,c:6},2]]); ok(!validateCreatorDefinition(def).includes("Look-and-say cage conflict.")); def=withValues(made.def,[[{r:0,c:0},5],[{r:3,c:3},2],[{r:6,c:6},3]]); ok(validateCreatorDefinition(def).includes("Look-and-say cage conflict."));
const malformed=add(base(),"look-and-say-cages",[a,b],"1525").def; ok(validateCreatorDefinition(malformed).some((m)=>m.startsWith("Look-and-say cage clues")));

made=add(base(),"different-values",[{r:0,c:0},{r:4,c:4},{r:8,c:8}]); def=withValues(made.def,[[{r:0,c:0},4],[{r:4,c:4},4]]); ok(validateCreatorDefinition(def).includes("Different Values conflict."));
made=add(base(),"extra-region",Array.from({length:9},(_,i)=>({r:i,c:(i*2)%9}))); equal(creatorConstraints(made.def)[0].type,"different-values"); equal(creatorConstraints(made.def)[0].sourceElementId,"extra-region");

const circles=[{r:0,c:0},{r:4,c:4},{r:8,c:7}]; made=add(base(),"counting-circles",circles); def=withValues(made.def,[[circles[0],2],[circles[1],2],[circles[2],1]]); ok(!validateCreatorDefinition(def).includes("Counting Circles conflict.")); def=withValues(made.def,[[circles[0],2],[circles[1],1],[circles[2],1]]); ok(validateCreatorDefinition(def).includes("Counting Circles conflict."));

// Shape validation, visual tagging, selection replacement, persistence and legacy normalization.
made=add(base(),"difference-kropki",[a,{r:2,c:2}],"1"); ok(validateCreatorDefinition(made.def).some((m)=>m.includes("orthogonally adjacent")));
made=add(base(),"quadruples",[a,{r:3,c:3}],"12"); ok(validateCreatorDefinition(made.def).some((m)=>m.startsWith("A quadruple must")));
made=add(base(),"ratio-kropki",[a,b],"3"); ok(made.def.scene?.overlays.some((part)=>part["data-sphenpad-constraint"]===made.constraintId));
def=replaceCreatorGroupCells(made.def,made.constraintId,[{r:2,c:2},{r:2,c:3}]); equal((creatorConstraints(def)[0].cells as CellRC[])[0].r,2); ok(def.scene?.overlays.some((part)=>part["data-sphenpad-constraint"]===made.constraintId));
def=updateCreatorGroupConstraint(def,made.constraintId,{negativeValues:[2,3],overrideNegativeDifferences:true}); const roundTrip=definitionFromCreatorProject(creatorProjectFromDefinition(def)); equal((creatorConstraints(roundTrip)[0].negativeValues as number[]).join(","),"2,3"); equal(creatorConstraints(roundTrip)[0].overrideNegativeDifferences,true);

let legacy=add(base(),"difference-kropki",[a,b],"1").def; legacy={...legacy,logic:{...(legacy.logic??{}),constraints:creatorConstraints(legacy).map((constraint)=>({...constraint,type:"difference-kropki",sourceElementId:undefined,difference:undefined,value:undefined}))}}; legacy=normalizeCreatorGroupConstraints(legacy); equal(creatorConstraints(legacy)[0].type,"difference"); equal(Number(creatorConstraints(legacy)[0].difference),1);
console.log("creator group constraint tests passed");
