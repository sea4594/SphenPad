const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');

const read = name => fs.readFileSync(name,'utf8');
const app = read('src/app/App.tsx');
const settings = read('src/ui/SettingsButton.tsx');
const main = read('src/ui/MainMenu.tsx');
const folders = read('src/ui/FoldersPage.tsx');
const archive = read('src/ui/CtCArchivePage.tsx');
const puzzle = read('src/ui/PuzzlePage.tsx');

assert.match(app, /useDeferredValue\(pathname\)/, 'defer nonessential active-page work');
assert.match(app, /mountedMainPages, setMountedMainPages/, 'track visited main pages');
assert.match(app, /requestAnimationFrame\(\(\) => \{\s*secondFrame = window\.requestAnimationFrame/, 'paint the empty destination before its first heavy mount');
assert.match(app, /cancelAnimationFrame\(firstFrame\)/, 'cancel outdated initial mounts');
assert.match(app, /mountedMainPages\.length === 0 && !isMainRoute\(pathname\)/, 'do not mount hidden main pages on direct puzzle resume');
for (const [route, page] of [['/', 'MainMenu'], ['/folders', 'FoldersPage'], ['/archive', 'CtCArchivePage']]) {
  assert.ok(app.includes(`mountedMainPages.includes("${route}") || pathname === "${route}"`), `immediate ${page} shell`);
  assert.ok(app.includes(`mountedMainPages.includes("${route}") ?`), `${page} mounts on first visit`);
  assert.ok(app.includes(`${page} active={activeForWork === "${route}"}`), `${page} data refresh follows visual route`);
  assert.ok(app.includes(`visibility: pathname === "${route}" ? "visible" : "hidden"`), `${page} stays visually hidden while inactive`);
}
for (const [page, source] of [['MainMenu', main], ['FoldersPage', folders], ['CtCArchivePage',archive]]) {
  assert.match(source, /<SettingsButton key=\{location\.key\} \/>/, `${page} owns a lightweight settings button`);
  assert.doesNotMatch(source, /setSettingsOpen/, `${page} no longer rerenders its list to open Settings`);
  assert.doesNotMatch(source, /startTransition\(\(\) => nav\(/, `${page} navigates promptly`);
}
assert.match(settings, /memo\(function SettingsButton/, 'settings component remains independent');
assert.match(settings, /\{open \? createPortal\(<SettingsOverlay onClose=/, 'Settings overlay opens outside the sticky header without rerendering its page');
assert.doesNotMatch(puzzle, /startTransition\(\(\) => nav\(/, 'puzzle return navigation is high priority');
assert.doesNotMatch(archive, /Loading preview\.\.\.|Loading rules\.\.\./, 'previews remain blank until ready');
for (const file of ['src/app/App.tsx', 'src/ui/SettingsButton.tsx', 'src/ui/MainMenu.tsx', 'src/ui/FoldersPage.tsx', 'src/ui/CtCArchivePage.tsx', 'src/ui/PuzzlePage.tsx']) {
  const out = ts.transpileModule(read(file), {fileName:file, reportDiagnostics:true, compilerOptions: {jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext}});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${file} must parse: ${errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; ')}`);
}
console.log('Immediate navigation: first-visit empty shells, retained visited pages, deferred refresh, isolated Settings, and blank previews PASS');
