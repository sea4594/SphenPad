import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const dist = resolve('dist');
const rootIndex = join(dist, 'index.html');
await stat(rootIndex);

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    let file = join(dist, pathname.replace(/^\/+/, ''));
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); }
    catch { file = rootIndex; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { 'content-type':'text/plain' });
    res.end(String(error));
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const { port } = server.address();

const candidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
].filter(Boolean);
let chrome;
for (const candidate of candidates) {
  if (candidate.includes('/')) {
    const p = spawnSync('test', ['-x', candidate]);
    if (p.status === 0) { chrome = candidate; break; }
  } else {
    const p = spawnSync('sh', ['-lc', `command -v ${candidate}`], { encoding:'utf8' });
    if (p.status === 0 && p.stdout.trim()) { chrome = p.stdout.trim(); break; }
  }
}
if (!chrome) {
  server.close();
  throw new Error('No Chrome/Chromium found. Set CHROME_BIN to the browser executable.');
}

const url = `http://127.0.0.1:${port}/`;
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-sync',
  '--run-all-compositor-stages-before-draw', '--virtual-time-budget=5000',
  '--dump-dom', url,
];
if (process.platform !== 'darwin') args.unshift('--no-sandbox');
const child = spawn(chrome, args, { stdio:['ignore','pipe','pipe'] });
let stdout='', stderr='';
child.stdout.on('data', d => stdout += d);
child.stderr.on('data', d => stderr += d);
const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
const code = await new Promise(resolveExit => child.on('exit', resolveExit));
clearTimeout(timer);
await new Promise(resolveClose => server.close(resolveClose));

if (code !== 0) throw new Error(`Headless browser exited ${code}: ${stderr.slice(-3000)}`);
if (!stdout.includes('id="root"')) throw new Error('Production DOM did not contain #root.');
// React should render something inside the root after the virtual-time budget.
if (/<div id="root"><\/div>/.test(stdout.replace(/\s+/g, ' '))) throw new Error('React root remained empty in production browser smoke test.');
if (/Internal Server Error|Uncaught TypeError|Uncaught ReferenceError/.test(stdout + stderr)) throw new Error(`Fatal browser output detected: ${stderr.slice(-3000)}`);
console.log(`PASS production browser smoke: ${chrome}`);
