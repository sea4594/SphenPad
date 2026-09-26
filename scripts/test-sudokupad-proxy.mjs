import assert from "node:assert/strict";
import worker, { _test } from "../edge/sudokupad-proxy-worker.js";

const originalFetch = globalThis.fetch;
const env = { ALLOWED_ORIGIN: "https://sphenpad.example", UPSTREAM_TIMEOUT_MS: "50", MAX_ASSET_BYTES: "16" };
const req = (path, init = {}) => new Request(`https://proxy.example${path}`, init);

function withFetch(mock, fn) {
  globalThis.fetch = mock;
  return Promise.resolve().then(fn).finally(() => { globalThis.fetch = originalFetch; });
}

assert.equal(_test.isPrivateIpv4("127.0.0.1"), true);
assert.equal(_test.isPrivateIpv4("172.31.2.3"), true);
assert.equal(_test.isPrivateIpv4("8.8.8.8"), false);
assert.equal(_test.isPrivateIpv6("::1"), true);
assert.throws(() => _test.allowedAssetUrl("file:///tmp/a.png"));
assert.throws(() => _test.allowedAssetUrl("http://localhost/a.png"));
assert.throws(() => _test.allowedAssetUrl("http://10.1.2.3/a.png"));
assert.throws(() => _test.allowedAssetUrl("https://user:pass@example.com/a.png"));
assert.equal(_test.validMime("image", "image/png"), true);
assert.equal(_test.validMime("image", "text/html"), false);
assert.equal(_test.validMime("font", "font/ttf"), true);

let res = await worker.fetch(req("/asset"), env);
assert.equal(res.status, 400);
assert.equal(res.headers.get("access-control-allow-origin"), env.ALLOWED_ORIGIN);
res = await worker.fetch(req("/x", { method: "POST" }), env);
assert.equal(res.status, 405);
res = await worker.fetch(req("/x", { method: "OPTIONS" }), env);
assert.equal(res.status, 204);

await withFetch(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }), async () => {
  const url = encodeURIComponent("https://example.com/a.png");
  const out = await worker.fetch(req(`/asset?kind=image&url=${url}`), env);
  assert.equal(out.status, 200);
  assert.equal((await out.arrayBuffer()).byteLength, 3);
  assert.equal(out.headers.get("x-content-type-options"), "nosniff");
});

await withFetch(async () => new Response("html", { headers: { "content-type": "text/html" } }), async () => {
  const url = encodeURIComponent("https://example.com/a.png");
  assert.equal((await worker.fetch(req(`/asset?url=${url}`), env)).status, 415);
});

await withFetch(async () => new Response(new Uint8Array(17), { headers: { "content-type": "image/png" } }), async () => {
  const url = encodeURIComponent("https://example.com/a.png");
  assert.equal((await worker.fetch(req(`/asset?url=${url}`), env)).status, 413);
});

let redirected = false;
await withFetch(async (url) => {
  if (!redirected) {
    redirected = true;
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private.png" } });
  }
  throw new Error(`unexpected fetch ${url}`);
}, async () => {
  const url = encodeURIComponent("https://example.com/a.png");
  const out = await worker.fetch(req(`/asset?url=${url}`), env);
  assert.equal(out.status, 400);
  assert.match(await out.text(), /Private-network/);
});

await withFetch((url, init) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
}), async () => {
  const url = encodeURIComponent("https://example.com/slow.png");
  const out = await worker.fetch(req(`/asset?url=${url}`), env);
  assert.equal(out.status, 504);
});

await withFetch(async (url) => {
  assert.equal(String(url), "https://sudokupad.app/api/puzzle/abc%20def");
  return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
}, async () => {
  const out = await worker.fetch(req("/puzzle/abc%20def"), env);
  assert.equal(out.status, 200);
});

console.log("SudokuPad proxy tests: PASS");
