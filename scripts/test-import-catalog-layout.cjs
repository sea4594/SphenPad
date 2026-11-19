/* Targeted regression tests for Import page catalog metadata and tab-local filters. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const src = fs.readFileSync('src/ui/CtCArchivePage.tsx', 'utf8');
const css = fs.readFileSync('src/app/styles.css', 'utf8');
const ast = ts.createSourceFile('CtCArchivePage.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0, ast.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n'));
assert.match(src, /className="archiveCatalogTabs" role="tablist"/);
assert.ok(src.indexOf('className="archiveCatalogTabs"') > src.indexOf('className="row archiveLoadRow"'));
assert.ok(src.indexOf('className="archiveCatalogTabs"') < src.indexOf('placeholder="Sudokupad URL"'));
assert.doesNotMatch(src, /archiveLoadLabel">Puzzle URL/);
assert.match(src, /aria-expanded=\{filtersExpanded\} aria-controls="archive-extra-filters"/);
assert.match(src, /\{filtersExpanded && <div id="archive-extra-filters"/);
assert.ok(src.indexOf('Surprise me!') > src.indexOf('{filtersExpanded && <div'), 'Surprise stays visible after the collapsed filters');
assert.match(src, /\}\s*<button type="button" className="btn primary archiveSurpriseButton"/);
assert.match(src, /onClick=\{\(\) => onSwitchCatalog\("ctc"\)\}/);
assert.match(src, /onClick=\{\(\) => onSwitchCatalog\("lmg"\)\}/);
assert.match(src, /catalog === "ctc" && <div className="archiveLengthRow">/);
assert.match(src, /catalog === "lmg" && <div className="archiveFilterRow">/);
assert.match(src, /Quality: \{entry.lmgRating/);
assert.match(src, /Solves: \{entry.lmgSolves/);
assert.match(src, /className="archiveMetaSmall">\{display\(author\)\}/);
assert.match(src, /const author = clean\(entry.puzzleAuthor\)/);
assert.match(src, /options=\{catalog === "lmg" \? LMG_SORT_OPTIONS : ARCHIVE_SORT_OPTIONS\}/);
assert.match(css, /\.archiveSearchRow/);
assert.match(css, /\.archiveExpandableFilters/);

const between=(start,end)=>{const i=src.indexOf(start),j=src.indexOf(end,i+start.length);assert.ok(i>=0 && j>i,`Cannot find section ${start}`);return src.slice(i,j);};
const toJS = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
const base={
  query:'', searchField:'any', sortField:'date', sortDirection:'desc',
  hostFilters:[], authorFilters:[], collectionFilters:[], constraintFilters:[],
  minLength:'', maxLength:'', difficultyFilter:'', minRating:'', minSolves:'',
};
const storage=new Map();
const context={
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  filterPrefsKey:c=>c==='lmg'?'sphenpad-lmg-filters-v1':'sphenpad-archive-filters-v1',
  DEFAULT_ARCHIVE_FILTER_PREFS:base,
  DEFAULT_LMG_FILTER_PREFS:{...base, sortField:'rating'},
  clean:x=>(x??'').trim(),
  isSearchField:x=>['any','title','constraints','video_title','author','host','collection'].includes(x),
  isSortField:x=>['title','video_length','date','rating','solves'].includes(x),
  isSortDirection:x=>x==='asc'||x==='desc',
};
vm.createContext(context);
const reader=between('function readInitialArchiveFilterPrefs(', '\ntype CachedPuzzlePayload');
vm.runInContext(toJS(reader+'\nglobalThis.readPrefs = readInitialArchiveFilterPrefs;'), context);
assert.equal(context.readPrefs('ctc').sortField,'date');
assert.equal(context.readPrefs('lmg').sortField,'rating');
storage.set('sphenpad-archive-filters-v1',JSON.stringify({...base, query:'killer',authorFilters:['Author CtC'],sortField:'video_length'}));
storage.set('sphenpad-lmg-filters-v1',JSON.stringify({...base, query:'renban',authorFilters:['Author LMG'],difficultyFilter:'Hard',minRating:'90',sortField:'solves'}));
assert.equal(context.readPrefs('ctc').query,'killer');
assert.equal(context.readPrefs('lmg').query,'renban');
assert.equal(context.readPrefs('ctc').authorFilters[0],'Author CtC');
assert.equal(context.readPrefs('lmg').authorFilters[0],'Author LMG');
assert.equal(context.readPrefs('lmg').minRating,'90');
assert.equal(context.readPrefs('lmg').sortField,'solves');
assert.equal(context.readPrefs('ctc').sortField,'video_length');

const norm=between('function normalizeLmgDifficulty(', '\nfunction writeArchiveFilterPrefs(');
vm.runInContext(toJS(norm+'\nglobalThis.normalDifficulty=normalizeLmgDifficulty;'), context);
assert.equal(context.normalDifficulty('mittelschweres Rätsel'), 'Medium');
assert.equal(context.normalDifficulty('Hard'), 'Hard');
assert.equal(context.normalDifficulty('leichtes Sudoku'), 'Easy');
assert.equal(context.normalDifficulty(''), 'Unrated');

// Verify real filter and sort callbacks on representative CtC/LMG data.
const sortFilter = between('  const sortedRows = useMemo(() => {','\n  useEffect(() => {\n    setVisibleRowsCount');
const sample=[
  {id:'a',title:'A',lmgDifficulty:'Hard',lmgRating:95,lmgSolves:120,videoHost:'LMG',videoDateTs:10,puzzleAuthor:'Alpha',constraintTypes:['Renban'],puzzleAuthorLower:'alpha'},
  {id:'b',title:'B',lmgDifficulty:'Medium',lmgRating:50,lmgSolves:10,videoHost:'LMG',videoDateTs:20,puzzleAuthor:'Beta',constraintTypes:['Killer'],puzzleAuthorLower:'beta'},
  {id:'c',title:'C',lmgDifficulty:'Hard',lmgRating:null,lmgSolves:null,videoHost:'LMG',videoDateTs:30,puzzleAuthor:'Gamma',constraintTypes:[],puzzleAuthorLower:'gamma'},
];
Object.assign(context,{
  useMemo:f=>f(), rows:sample, sortField:'rating',sortDirection:'desc',
  catalog:'lmg', deferredQuery:'', searchField:'any', hostFilters:[],authorFilters:[],collectionFilters:[],constraintFilters:[],
  minLength:'',maxLength:'', difficultyFilter:'Hard',minRating:'80',minSolves:'100',
  splitSemicolonValues:s=>s.split(';').filter(Boolean),parseMinutesToSeconds:()=>null,
  matchesSearch:()=>true,
});
vm.runInContext(toJS(sortFilter+'\nglobalThis.sortedIds=sortedRows.map(r=>r.id);globalThis.filteredIds=filteredRows.map(r=>r.id);'),context);
assert.equal(Array.from(context.sortedIds).join(','),'a,b,c');
assert.equal(Array.from(context.filteredIds).join(','),'a');

console.log('Import catalogs: compact filters, tab-specific persistence, LMG metadata/sorting, and CtC separation PASS');
