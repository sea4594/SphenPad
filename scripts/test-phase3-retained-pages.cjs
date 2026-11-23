/* Phase 3 regression: DOM/mount lifecycle and visible previews must not change. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('src/app/App.tsx', 'utf8');
const css = fs.readFileSync('src/app/styles.css', 'utf8');

for (const [route, page] of [['/', 'MainMenu'], ['/folders', 'FoldersPage'], ['/archive', 'CtCArchivePage']]) {
  assert.ok(app.includes(`data-main-page-visible={pathname === "${route}" ? "true" : "false"}`), `${page}: visibility tracks actual route`);
  assert.ok(app.includes(`visibility: pathname === "${route}" ? "visible" : "hidden"`), `${page}: fallback preserves inactive visibility`);
  assert.ok(app.includes(`pointerEvents: pathname === "${route}" ? "auto" : "none"`), `${page}: hidden pages cannot intercept touches`);
  assert.ok(new RegExp(`<${page}\\s+active=`, 's').test(app), `${page}: existing active lifecycle remains intact`);
}
assert.ok(/mountedMainPages/.test(app) || /keepMainPagesMounted/.test(app) ||
  (app.includes('<MainMenu active=') && app.includes('<FoldersPage active=')), 'mounted main pages remain in DOM');
const section = css.match(/\/\* Phase 3: suppress inactive retained-page layout and paint\. \*\/[\s\S]*?\[data-main-page-visible="false"\]\s*\{([^}]*)\}/);
assert.ok(section, 'inactive layer CSS containment rule');
assert.match(section[1], /content-visibility:\s*hidden\s*;/);
assert.doesNotMatch(section[1], /(?:^|\n)\s*(?:display|visibility|height|overflow)\s*:|content-visibility\s*:\s*auto/,
  'do not collapse pages or change scrolling/layout');
assert.doesNotMatch(css.slice(section.index + section[0].length), /\[data-main-page-visible="true"\].*content-visibility/,
  'active page stays fully rendered');
assert.ok(app.includes('AccountSyncProvider'), 'account sync provider retained');
console.log('Phase 3: inactive pages skip layout/paint; mounted state, active previews, routing, and sync stay intact PASS');
