function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGlobalConstraint, CREATOR_GLOBAL_ELEMENT_IDS, creatorOutsideRayFromSelection, creatorSudokuRulesEnabled, defaultGlobalGroups, normalizeCreatorGlobalConstraints, replaceCreatorGlobalCells, setCreatorSudokuRules, updateCreatorGlobalConstraint } from "../src/sudokupad/creator/globalConstraints";

function base(size = 9, boxes = true): PuzzleDefinition { return createAuthoredPuzzleDefinition({ id: `global-${size}`, rows: size, cols: size, ...(boxes ? { subgrid: size === 9 ? { r: 3, c: 3 } : { r: 2, c: 2 } } : {}), digitRange: { min: 1, max: size }, meta: {} }); }
function withValues(def: PuzzleDefinition, entries: Array<[CellRC, number]>): PuzzleDefinition { return { ...def, givens: entries.map(([rc, value]) => ({ rc, v: String(value) })) }; }
function add(def: PuzzleDefinition, id: Parameters<typeof addCreatorGlobalConstraint>[1], cells: CellRC[] = [], value = "") { return addCreatorGlobalConstraint(def, id, cells, value); }
const c=(r:number,col:number):CellRC=>({r,c:col});

// SudokuRules is explicit and can disable ordinary row/column uniqueness without disabling regions.
let def=base(4,false); def=withValues(def,[[c(0,0),1],[c(0,1),1]]); ok(validateCreatorDefinition(def).includes("Duplicate given in row 1."));
def=setCreatorSudokuRules(def,false); equal(creatorSudokuRulesEnabled(def),false); ok(!validateCreatorDefinition(def).includes("Duplicate given in row 1."));
let rt=definitionFromCreatorProject(creatorProjectFromDefinition(def)); equal(rt.logic?.sudokuRules,false); equal(rt.meta.creatorSudokuRules,false);

// Both diagonals are real all-different semantic constraints with tagged visuals.
let made=add(base(),"negative-diagonal"); def=withValues(made.def,[[c(0,0),5],[c(4,4),5]]); ok(validateCreatorDefinition(def).includes("Negative diagonal conflict.")); ok(made.def.scene?.lines.some((line)=>line["data-sphenpad-constraint"]===made.constraintId));
made=add(base(),"positive-diagonal"); def=withValues(made.def,[[c(0,8),5],[c(4,4),5]]); ok(validateCreatorDefinition(def).includes("Positive diagonal conflict."));

// Disjoint groups use matching positions across equal active regions.
def=setCreatorSudokuRules(base(4),false); made=add(def,"disjoint-groups"); def=withValues(made.def,[[c(0,0),2],[c(0,2),2]]); ok(validateCreatorDefinition(def).includes("Disjoint group 1 conflict."));

// Nonconsecutive is board-wide across orthogonal edges.
def=setCreatorSudokuRules(base(4,false),false); made=add(def,"nonconsecutive"); def=withValues(made.def,[[c(1,1),2],[c(1,2),3]]); ok(validateCreatorDefinition(def).includes("Nonconsecutive conflict."));

// Global entropy/modulo groups are configurable and must cover the digit set.
made=add(base(),"global-entropy"); equal(defaultGlobalGroups(made.def,"entropy").map(g=>g.join("")).join("|"),"123|456|789"); def=withValues(made.def,[[c(0,0),1],[c(0,1),2],[c(1,0),4],[c(1,1),5]]); ok(validateCreatorDefinition(def).includes("global-entropy conflict."));
def=updateCreatorGlobalConstraint(made.def,made.constraintId,{groups:[[1,4,7],[2,5,8],[3,6,9]]}); equal((creatorConstraints(def)[0].groups as number[][])[0].join(","),"1,4,7");
made=add(base(),"global-modulo-3"); equal((creatorConstraints(made.def)[0].groups as number[][]).map(g=>g.join("")).join("|"),"369|147|258");
let malformed=updateCreatorGlobalConstraint(made.def,made.constraintId,{groups:[[1,2],[2,3]]}); ok(validateCreatorDefinition(malformed).some((m)=>m.includes("digit groups are invalid or overlap")));

// Outside clue geometry and each upstream rule family.
const diagonal=[c(0,0),c(1,1),c(2,2)]; made=add(base(),"little-killers",diagonal,"10"); def=withValues(made.def,[[diagonal[0],1],[diagonal[1],2],[diagonal[2],3]]); ok(validateCreatorDefinition(def).includes("Little killer sum conflict."));
const row3=[c(0,0),c(0,1),c(0,2)]; made=add(base(),"sandwich-sums",row3,"1"); def=withValues(made.def,[[row3[0],1],[row3[1],5],[row3[2],9]]); ok(validateCreatorDefinition(def).includes("Sandwich sum conflict."));
made=add(base(),"x-sums",row3,"7"); def=withValues(made.def,[[row3[0],3],[row3[1],1],[row3[2],2]]); ok(validateCreatorDefinition(def).includes("X-sum conflict."));
made=add(base(),"skyscrapers",row3,"2"); def=withValues(made.def,[[row3[0],1],[row3[1],2],[row3[2],3]]); ok(validateCreatorDefinition(def).includes("Skyscraper conflict."));
made=add(base(),"numbered-rooms",row3,"6"); def=withValues(made.def,[[row3[0],3],[row3[1],1],[row3[2],7]]); ok(validateCreatorDefinition(def).includes("Numbered room conflict."));
malformed=add(base(),"little-killers",[c(2,2),c(3,3)],"4").def; ok(validateCreatorDefinition(malformed).some((m)=>m.includes("ray must begin at the board edge")));
malformed=add(base(),"sandwich-sums",[c(0,0),c(0,1),c(1,1)],"4").def; ok(validateCreatorDefinition(malformed).some((m)=>m.includes("ordered adjacent ray")));
const expanded=creatorOutsideRayFromSelection(base(),"x-sums",[c(0,3)]); equal(expanded.length,9); equal(expanded[8].r,8);

// Row/column indexer semantics.
made=add(setCreatorSudokuRules(base(),false),"row-indexers",[c(1,0)]); def=withValues(made.def,[[c(1,0),3],[c(2,0),1]]); ok(validateCreatorDefinition(def).includes("Row indexer conflict."));
def=withValues(made.def,[[c(1,0),3],[c(2,0),2]]); ok(!validateCreatorDefinition(def).includes("Row indexer conflict."));
made=add(setCreatorSudokuRules(base(),false),"column-indexers",[c(0,1)]); def=withValues(made.def,[[c(0,1),3],[c(0,2),1]]); ok(validateCreatorDefinition(def).includes("Column indexer conflict."));
def=withValues(made.def,[[c(0,1),3],[c(0,2),2]]); ok(!validateCreatorDefinition(def).includes("Column indexer conflict."));

// Custom definitions persist SudokuMaker-style schema/backend/components but are not executed in creator validation.
made=add(base(),"custom-constraint",[c(0,0)]); def=updateCreatorGlobalConstraint(made.def,made.constraintId,{definitionName:"My rule",code:"return true;",input:{target:5},inputSchema:[{name:"target",type:"number"}],components:[{type:"cells"}]});
let custom=creatorConstraints(def)[0];
let customDefinition = custom.definition as Record<string, unknown>;
const customBackend = customDefinition.backend as Record<string, unknown>;
let customInput = custom.input as Record<string, unknown>;
equal(customDefinition.name,"My rule"); equal(customBackend.code,"return true;"); equal(customInput.target,5); ok(!validateCreatorDefinition(def).some((m)=>m.includes("Custom constraint has invalid")));
rt=definitionFromCreatorProject(creatorProjectFromDefinition(def)); custom=creatorConstraints(rt)[0]; customDefinition = custom.definition as Record<string, unknown>; customInput = custom.input as Record<string, unknown>; equal((customDefinition.components as unknown[]).length,1); equal(customInput.target,5);

// Fog lights/triggers generate native scene fog data and keep trigger/effect cells independently editable.
made=add(base(),"fog-lights",[c(0,0),c(0,1)]); equal(made.def.scene?.fog?.initialLightCells.length,2);
const trigger=add(made.def,"custom-fog-clearing",[c(1,1)]); def=replaceCreatorGlobalCells(trigger.def,trigger.constraintId,[c(2,2),c(2,3)],"effect"); equal(def.scene?.fog?.triggerEffects.length,1); equal(def.scene?.fog?.triggerLinks?.[0]?.effectCells.length,2);
def=replaceCreatorGlobalCells(def,trigger.constraintId,[c(3,3)],"trigger"); equal(def.scene?.fog?.triggerLinks?.[0]?.triggerCells[0]?.[0],3);
rt=definitionFromCreatorProject(creatorProjectFromDefinition(def)); equal(rt.scene?.fog?.triggerLinks?.[0]?.effectCells.length,2);

// Normalization upgrades legacy generic 10D/11D records to the 11G semantic representation.
let legacy=add(base(),"negative-diagonal").def; legacy={...legacy,logic:{...(legacy.logic??{}),constraints:creatorConstraints(legacy).map((constraint)=>({...constraint,type:"negative-diagonal"}))}}; legacy=normalizeCreatorGlobalConstraints(legacy); equal(creatorConstraints(legacy)[0].type,"diagonal"); equal(creatorConstraints(legacy)[0].positive,false);
legacy=add(base(),"custom-fog-clearing",[c(1,1)]).def; legacy={...legacy,logic:{...(legacy.logic??{}),constraints:creatorConstraints(legacy).map((constraint)=>({...constraint,type:"custom-fog-clearing",effectCells:undefined}))}}; legacy=normalizeCreatorGlobalConstraints(legacy); equal(creatorConstraints(legacy)[0].type,"fog-trigger"); ok(Array.isArray(creatorConstraints(legacy)[0].effectCells));

// Inventory is complete for this phase and has no duplicate authoring ids.
equal(new Set(CREATOR_GLOBAL_ELEMENT_IDS).size,CREATOR_GLOBAL_ELEMENT_IDS.length); equal(CREATOR_GLOBAL_ELEMENT_IDS.length,16);
console.log("creator global/outside/advanced constraint tests passed");
