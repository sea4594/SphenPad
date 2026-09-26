import assert from "node:assert/strict";
import { SudokuPadAssetResolver } from "../src/sudokupad/assets/assetResolver.ts";

const png = new Blob([new Uint8Array([1,2,3])], { type: "image/png" });
let calls = [];
const resolver = new SudokuPadAssetResolver({
  sudokuPadOrigin: "https://sudokupad.app",
  maxBytes: 8,
  timeoutMs: 50,
  proxyUrl: (url, kind) => `https://proxy.example/asset?kind=${kind}&url=${encodeURIComponent(url)}`,
  fetchFn: async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith("https://sudokupad.app/")) return new Response("blocked", { status: 403, statusText: "Forbidden" });
    assert.equal(init?.signal?.aborted, false);
    return new Response(png, { headers: { "content-type": "image/png", "content-length": "3" } });
  },
});

const first = await resolver.fetchBlob("/assets/test.png", "image");
assert.equal(first.originalUrl, "https://sudokupad.app/assets/test.png");
assert.equal(first.blob.size, 3);
assert.equal(calls.length, 2);
const second = await resolver.fetchBlob("/assets/test.png", "image");
assert.equal(second.blob.size, 3);
assert.equal(calls.length, 2, "resolved assets should be cached");

await assert.rejects(
  new SudokuPadAssetResolver({ fetchFn: async () => new Response("html", { headers: { "content-type": "text/html" } }) }).fetchBlob("https://example.com/a.png", "image"),
  /not an image/,
);
await assert.rejects(
  new SudokuPadAssetResolver({ maxBytes: 2, fetchFn: async () => new Response(png, { headers: { "content-type": "image/png", "content-length": "3" } }) }).fetchBlob("https://example.com/a.png", "image"),
  /exceeds 2 bytes/,
);
await assert.rejects(
  new SudokuPadAssetResolver({ timeoutMs: 10, fetchFn: (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }) }).fetchBlob("https://example.com/slow.png", "image"),
  /timed out|TimeoutError/i,
);
await assert.rejects(
  resolver.fetchBlob("file:///tmp/a.png", "image"),
  /Unsupported external asset scheme/,
);

console.log("SudokuPad asset resolver tests: PASS");
