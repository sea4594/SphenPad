/* Phase 2 source and behavior regressions: no storage or network dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const child = require('node:child_process');
const path = require('node:path');
const src = fs.readFileSync('src/core/storage.ts', 'utf8');
const menu = fs.readFileSync('src/ui/MainMenu.tsx','utf8');
const folders = fs.readFileSync('src/ui/FoldersPage.tsx','utf8');
const archive = fs.readFileSync('src/ui/CtCArchivePage.tsx','utf8');

assert.match(src, /let puzzleListInFlight: Promise<StoredPuzzleRow\[\]> \| null = null;/);
assert.match(src, /let folderListInFlight: Promise<PuzzleFolder\[\]> \| null = null;/);
assert.match(src, /if \(epoch !== puzzleListEpoch\) continue;/);
assert.match(src, /if \(epoch !== folderListEpoch\) continue;/);
assert.match(src, /for \(const \[key, data\] of pendingPuzzleWrites\) current\.set\(key, data\)/);
assert.match(src, /if \(changes\.puzzles\.length \|\| changes\.creatorProjects\.length\) puzzleListEpoch\+\+;/);
assert.match(src, /if \(changes\.folders\.length\) folderListEpoch\+\+;/);
assert.match(src, /signalStorageMutation\(sync, data\.updatedAt \|\| Date\.now\(\), \{ puzzles: false, folders: false, creatorProjects: false \}\)/);
assert.match(src, /signalStorageMutation\(true, folder\.updatedAt, \{ puzzles: false, creatorProjects: false \}\)/);
for (const [name, page] of [['Puzzles', menu],['Folders',folders]]) {
  assert.doesNotMatch(page, /pendingRefreshRef/);
  assert.doesNotMatch(page, /active \|\| syncStatus === "syncing"/);
  assert.match(page, /if \(!active\) return;[\s\S]*?onStorageRefreshNeeded/);
}
assert.doesNotMatch(archive, /pendingRefreshRef/);
assert.match(archive, /if \(!active\) return;\s+void refreshCompleted\(\);\s+void refreshFolders\(\);/);

function getTypeScript() {
  try { return require('typescript'); } catch {
    const root = child.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
    return require(path.join(root,'typescript'));
  }
}
const ts = getTypeScript();
function between(a,b) {
  const i=src.indexOf(a), j=src.indexOf(b,i+a.length);
  assert(i>=0 && j>i,`missing source section ${a}`);
  return src.slice(i,j);
}
const implementation = [
  'let puzzlesListCache = null, foldersListCache = null;',
  'let puzzleListEpoch = 0, folderListEpoch = 0;',
  'let puzzleListInFlight = null, folderListInFlight = null;',
  'let pendingPuzzleWrites = new Map();',
  between('export function listPuzzles():', 'export async function listCompletedPuzzleKeys'),
  between('export function listFolders():', 'export async function createFolder'),
].join('\n');
const transpiled = ts.transpileModule(implementation,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
assert(!transpiled.diagnostics?.length, 'TypeScript snippet must transpile');

function setup({readPuzzles,readFolders}) {
  const context = {
    exports: {},
    Promise, Map,
    db: {puzzles:{toArray:readPuzzles},folders:{toArray:readFolders}},
    hydratePersistedPuzzle: async x => x,
  };
  vm.runInNewContext(transpiled.outputText,context);
  return { ...context.exports, context };
}
const make = (key,updatedAt,status='in_progress') => ({key,data:{updatedAt,def:{id:key,meta:{}},progress:{status}}});

(async()=>{
  // Two pages mount together: only one IndexedDB scan and shared result.
  let puzzleScans = 0, folderScans = 0;
  const a = setup({readPuzzles:async()=>{ puzzleScans++; return [make('one',1)]; },readFolders:async()=>{folderScans++;return [{id:'folder',name:'F'}];}});
  const [p1,p2,p3,f1,f2] = await Promise.all([a.listPuzzles(),a.listPuzzles(),a.listPuzzles(),a.listFolders(),a.listFolders()]);
  assert.equal(puzzleScans,1); assert.equal(folderScans,1);
  assert.strictEqual(p1,p2); assert.strictEqual(p2,p3); assert.strictEqual(f1,f2);
  await a.listPuzzles(); await a.listFolders();
  assert.equal(puzzleScans,1); assert.equal(folderScans,1);

  // A local puzzle edit while an old IndexedDB read is in progress must win.
  let releaseOld;
  let bReads=0;
  const b=setup({readPuzzles:()=>{bReads++;return bReads===1 ? new Promise(r=>{releaseOld=r}) : Promise.resolve([make('one',1)]);},readFolders:async()=>[]});
  const inflight=b.listPuzzles();
  await Promise.resolve();await Promise.resolve();
  const newData=make('one',9,'complete').data;
  vm.runInNewContext('pendingPuzzleWrites.set("one", latest); puzzleListEpoch++;',Object.assign(b.context,{latest:newData}));
  releaseOld([make('one',1)]);
  const latest = await inflight;
  assert.equal(latest[0].updatedAt,9);
  assert.equal(latest[0].progress.status,'complete');
  assert.equal(bReads,2, 'stale scan must be retried once');

  // A cloud folder update invalidates a stale pending folder load.
  let resolveFirst;
  let cReads=0;
  const c=setup({readPuzzles:async()=>[],readFolders:()=>{ cReads++; return cReads===1 ? new Promise(r=>resolveFirst=r) : Promise.resolve([{id:'new',name:'Updated'}]);}});
  const pending=c.listFolders();
  await Promise.resolve();await Promise.resolve();
  vm.runInNewContext('folderListEpoch++;',c.context);
  resolveFirst([{id:'old',name:'Stale'}]);
  const updated=await pending;
  assert.equal(updated[0].id,'new'); assert.equal(cReads,2);

  // Errors must not poison the promise cache; the next refresh can retry.
  let failures=0;
  const d=setup({readPuzzles:async()=>{failures++;if(failures===1) throw Error('transient');return [make('recovered',3)];},readFolders:async()=>[]});
  await assert.rejects(d.listPuzzles(), /transient/);
  await Promise.resolve();
  assert.equal((await d.listPuzzles())[0].key,'recovered');
  console.log('Phase 2 library: shared reads, optimistic updates, cloud invalidation, error retry, hidden-page refresh PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
