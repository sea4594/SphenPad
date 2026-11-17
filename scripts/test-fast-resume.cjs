// Cold-start routing regression: restoring a puzzle must not mount the library.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8');
const start = main.indexOf('try {\n  if (!window.location.hash');
const end = main.indexOf('\nReactDOM.createRoot', start);
assert.ok(start >= 0 && end > start, 'restore must run before React first renders');
const restore = new Function('window', 'localStorage', main.slice(start, end));
function boot(saved, hash = '', pathname = '/SphenPad/') {
  let navigated = null;
  const window = {
    location: { hash, pathname, search: '' },
    history: { state: { same: true }, replaceState(state, _title, url) { navigated = { state, url }; } },
  };
  restore(window, { getItem: () => saved });
  return navigated;
}
assert.equal(boot('/p/example')?.url, '/SphenPad/#/p/example', 'remembered puzzle must be the initial route');
assert.equal(boot('/p/example?creatorPlaytest=1')?.url, '/SphenPad/#/p/example?creatorPlaytest=1', 'puzzle state/query must survive');
assert.equal(boot('/creator/example')?.url, '/SphenPad/#/creator/example', 'creator resumes must continue working');
assert.equal(boot('/folders', '#/')?.url, '/SphenPad/#/folders', 'remembered main routes still restore');
assert.equal(boot('/p/old', '#/p/explicit'), null, 'explicit deep links must win over remembered routes');
assert.equal(boot('https://example.com/'), null, 'external routes must not restore');
assert.equal(boot('/'), null, 'root remains root when last page was home');
assert.match(app, /if \(!keepMainPagesMounted && !isMainRoute\(pathname\)\) return null;/, 'no library pages may mount before a main page is visited');
assert.ok(app.includes('import { MainMenu } from "../ui/MainMenu";'), 'main menu must load eagerly');

for (const page of ['FoldersPage', 'CtCArchivePage']) {
  assert.ok(
    app.includes(`import { ${page} } from "../ui/${page}";`),
    `${page} must load eagerly`
  );
}

for (const page of ['PuzzleCreatorPage', 'PuzzleEditorPage']) {
  assert.match(app, new RegExp(`const ${page} = lazy\\(`), `${page} must not block cold puzzle loading`);
}
console.log('Cold puzzle resume: synchronous restore, explicit links, eager main pages and deferred creator modules passed');
