import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const manifestPath = new URL('./data/sudokupad-font-manifest.json', import.meta.url);
const reportPath = new URL('../reports/sudokupad-phase10a-upstream-fonts.json', import.meta.url);
const origin = process.env.SUDOKUPAD_ORIGIN || 'https://sudokupad.app';
const timeoutMs = Number(process.env.SUDOKUPAD_VERIFY_TIMEOUT_MS || 15000);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function sfntSignature(buf) {
  if (buf.length < 4) return false;
  const sig = buf.subarray(0, 4).toString('latin1');
  return sig === 'OTTO' || sig === 'true' || sig === 'typ1' || (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00);
}

const results = await Promise.all(manifest.fonts.map(async (font) => {
  const url = new URL(`/assets/fonts/${encodeURIComponent(font.file)}`, origin).href;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'SphenPad-SudokuPad-parity-verifier/1.0' } });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const expectedSha256 = font.sha256 || null;
    const hashMatches = expectedSha256 ? sha256 === expectedSha256 : true;
    const ok = response.ok && bytes.length > 0 && sfntSignature(bytes) && hashMatches;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${font.id}: ${response.status}, ${bytes.length} bytes, ${sha256}`);
    return { id: font.id, file: font.file, url, status: response.status, contentType, bytes: bytes.length, sha256, expectedSha256, hashMatches, sfntValid: sfntSignature(bytes), ok };
  } catch (error) {
    console.error(`FAIL ${font.id}: ${error?.message || error}`);
    return { id: font.id, file: font.file, url, ok: false, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}));
const report = {
  target: manifest.target,
  origin,
  checkedAt: new Date().toISOString(),
  passed: results.filter(r => r.ok).length,
  total: results.length,
  fonts: results,
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
if (report.passed !== report.total) process.exitCode = 1;
