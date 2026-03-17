const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const puzzles = [
  'https://sudokupad.app/7nrei23yv6',
  'https://sudokupad.app/oj8y6yrx16',
  'https://sudokupad.app/dyg2otjpgb',
  'https://sudokupad.app/k4zgmts5h9',
  'https://sudokupad.app/darth-paradox/fillomenon',
  'https://sudokupad.app/ifd8mehebc',
  'https://sudokupad.app/k1obwcp28i',
];

const outDir = '/tmp/third-pass-visual-audit';
mkdirSync(outDir, { recursive: true });

function slugFromUrl(url) {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function loadPng(buffer) {
  return PNG.sync.read(buffer);
}

function sampleRgb(png, tw = 256, th = 256) {
  const out = new Float64Array(tw * th * 3);
  const sx = png.width / tw;
  const sy = png.height / th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const srcX = Math.max(0, Math.min(png.width - 1, Math.floor((x + 0.5) * sx)));
      const srcY = Math.max(0, Math.min(png.height - 1, Math.floor((y + 0.5) * sy)));
      const srcIdx = (srcY * png.width + srcX) * 4;
      const dstIdx = (y * tw + x) * 3;
      out[dstIdx] = png.data[srcIdx] / 255;
      out[dstIdx + 1] = png.data[srcIdx + 1] / 255;
      out[dstIdx + 2] = png.data[srcIdx + 2] / 255;
    }
  }
  return out;
}

function meanAbsoluteDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

async function screenshotLocalBoard(context, puzzleUrl, slug) {
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/#/archive', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const loadInput = page.locator('input.url[placeholder="https://sudokupad.app/..."]');
    await loadInput.waitFor({ timeout: 30_000 });
    await loadInput.fill(puzzleUrl);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.waitForSelector('.boardSurface canvas', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const locator = page.locator('.boardSurface canvas').first();
    const box = await locator.boundingBox();
    const buffer = await locator.screenshot({ type: 'png' });
    const path = join(outDir, `${slug}.local.png`);
    writeFileSync(path, buffer);
    return { path, width: box?.width ?? 0, height: box?.height ?? 0, buffer };
  } finally {
    await page.close();
  }
}

async function screenshotSudokuPadBoard(context, puzzleUrl, slug) {
  const page = await context.newPage();
  try {
    await page.goto(puzzleUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);

    const index = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('canvas, svg'));
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let bestIdx = -1;
      let bestScore = -1;
      nodes.forEach((node, idx) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
        const w = Math.max(0, rect.width);
        const h = Math.max(0, rect.height);
        if (w < 120 || h < 120) return;
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(vw, rect.right);
        const bottom = Math.min(vh, rect.bottom);
        const iw = Math.max(0, right - left);
        const ih = Math.max(0, bottom - top);
        const visibleArea = iw * ih;
        const area = w * h;
        if (visibleArea < 20_000) return;
        const ratioPenalty = Math.abs((w / h) - 1);
        const score = visibleArea - ratioPenalty * 20_000 + area * 0.05;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      return bestIdx;
    });

    if (index < 0) throw new Error('No suitable board element found on SudokuPad page');

    const locator = page.locator('canvas, svg').nth(index);
    const box = await locator.boundingBox();
    const buffer = await locator.screenshot({ type: 'png' });
    const path = join(outDir, `${slug}.sudokupad.png`);
    writeFileSync(path, buffer);
    return { path, width: box?.width ?? 0, height: box?.height ?? 0, buffer, index };
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
  const report = [];

  try {
    for (const url of puzzles) {
      const slug = slugFromUrl(url);
      const local = await screenshotLocalBoard(context, url, slug);
      const sudokupad = await screenshotSudokuPadBoard(context, url, slug);

      const localPng = loadPng(local.buffer);
      const spPng = loadPng(sudokupad.buffer);
      const localRgb = sampleRgb(localPng, 256, 256);
      const spRgb = sampleRgb(spPng, 256, 256);
      const mad = meanAbsoluteDiff(localRgb, spRgb);

      report.push({
        url,
        slug,
        local: { width: localPng.width, height: localPng.height, path: local.path },
        sudokupad: { width: spPng.width, height: spPng.height, path: sudokupad.path, index: sudokupad.index },
        meanAbsoluteRgbDiff: Number(mad.toFixed(6)),
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const reportPath = join(outDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, count: report.length, report }, null, 2));
})().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
