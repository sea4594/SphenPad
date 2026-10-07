const APP_CACHE = "sphenpad-app-v1";
const ARCHIVE_CACHE = "sphenpad-offline-archive-v1";
const EXTERNAL_CACHE = "sphenpad-external-static-v1";
const OFFLINE_ARCHIVE_LIMIT = 150;
const scopeUrl = new URL(self.registration.scope);
const archiveManifestUrl = new URL("archive/archive-manifest.json", scopeUrl).href;
const archivePuzzlePrefix = new URL("archive/puzzles/", scopeUrl).href;
const offlineManifestUrl = new URL("__offline/archive-manifest.json", scopeUrl).href;
const archiveStateUrl = new URL("__offline/archive-state.json", scopeUrl).href;
const connectivityUrl = new URL("manifest.json?offline-check=1", scopeUrl).href;
const externalStaticUrls = [
  "https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700;800&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap",
  "https://sudokupad.app/images/sudokupad_square_logo.png",
];

function cacheable(response) {
  return response && (response.ok || response.type === "opaque");
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function recentArchiveEntries(entries) {
  return entries
    .filter((entry) => archivePuzzleUrl(entry))
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTs = Number.isFinite(a.entry?.videoDateTs) ? a.entry.videoDateTs : -Infinity;
      const bTs = Number.isFinite(b.entry?.videoDateTs) ? b.entry.videoDateTs : -Infinity;
      return bTs - aTs || a.index - b.index;
    })
    .slice(0, OFFLINE_ARCHIVE_LIMIT)
    .map(({ entry }) => entry);
}

function archivePuzzleUrl(entry) {
  const key = String(entry?.cacheKey || entry?.stableKey || "").trim();
  return key ? new URL(`archive/puzzles/${encodeURIComponent(key)}.json`, scopeUrl).href : "";
}

async function readArchiveState(cache) {
  try {
    const response = await cache.match(archiveStateUrl);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function refreshOfflineArchiveFromData(data, versionToken = "") {
  if (!data || !Array.isArray(data.entries) || !data.entries.length) return;
  const entries = recentArchiveEntries(data.entries);
  if (!entries.length) return;

  const cache = await caches.open(ARCHIVE_CACHE);
  const nextUrls = entries.map(archivePuzzleUrl);
  const priorState = await readArchiveState(cache);
  const generatedAt = typeof data.generatedAt === "string" ? data.generatedAt : "";
  const nextToken = versionToken || generatedAt;
  const priorUrls = Array.isArray(priorState?.puzzleUrls) ? priorState.puzzleUrls : [];
  if (priorState?.versionToken === nextToken && priorUrls.length === nextUrls.length && priorUrls.every((url, index) => url === nextUrls[index])) {
    return;
  }

  await mapLimit(nextUrls, 8, async (url) => {
    const existing = await cache.match(url);
    if (existing && priorUrls.includes(url)) return;
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Unable to cache archive puzzle: ${url}`);
    await cache.put(url, response.clone());
  });

  const offlineManifest = JSON.stringify({ generatedAt, entries });
  await cache.put(offlineManifestUrl, new Response(offlineManifest, {
    headers: { "Content-Type": "application/json", "X-SphenPad-Offline": "1" },
  }));
  await cache.put(archiveStateUrl, new Response(JSON.stringify({ versionToken: nextToken, generatedAt, puzzleUrls: nextUrls }), {
    headers: { "Content-Type": "application/json" },
  }));

  const keep = new Set(nextUrls);
  for (const request of await cache.keys()) {
    if (request.url.startsWith(archivePuzzlePrefix) && !keep.has(request.url)) await cache.delete(request);
  }
}

async function refreshOfflineArchiveFromResponse(response) {
  try {
    const data = await response.json();
    const token = response.headers.get("etag") || response.headers.get("last-modified") || data?.generatedAt || "";
    await refreshOfflineArchiveFromData(data, token);
  } catch {
    // Keep the previous complete offline archive if refresh fails.
  }
}

async function refreshOfflineArchive() {
  try {
    const cache = await caches.open(ARCHIVE_CACHE);
    const priorState = await readArchiveState(cache);
    let token = "";
    try {
      const head = await fetch(archiveManifestUrl, { method: "HEAD", cache: "no-store" });
      if (head.ok) token = head.headers.get("etag") || head.headers.get("last-modified") || "";
    } catch {
      return;
    }
    if (token && priorState?.versionToken === token) return;
    const response = await fetch(archiveManifestUrl, { cache: "no-cache" });
    if (!response.ok) return;
    await refreshOfflineArchiveFromResponse(response);
  } catch {
    // Offline startup keeps the last complete archive snapshot.
  }
}

async function cacheExternalStatic() {
  const cache = await caches.open(EXTERNAL_CACHE);
  await mapLimit(externalStaticUrls, 3, async (url) => {
    try {
      const response = await fetch(url);
      if (!cacheable(response)) return;
      await cache.put(url, response.clone());
      if (!url.startsWith("https://fonts.googleapis.com/")) return;
      const css = await response.text();
      const fontUrls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g), (match) => match[1]);
      await Promise.all(fontUrls.map(async (fontUrl) => {
        try {
          const fontResponse = await fetch(fontUrl);
          if (cacheable(fontResponse)) await cache.put(fontUrl, fontResponse.clone());
        } catch {
          // Font fallback remains available even if one face cannot be cached.
        }
      }));
    } catch {
      // External cosmetics must never block installation.
    }
  });
}

async function refreshAppShell() {
  const cache = await caches.open(APP_CACHE);
  const response = await fetch(scopeUrl.href, { cache: "no-cache" });
  if (!response.ok) throw new Error("Unable to cache SphenPad app shell");
  const html = await response.clone().text();
  await cache.put(scopeUrl.href, response.clone());
  await cache.put(new URL("index.html", scopeUrl).href, response.clone());

  const urls = new Set([
    new URL("manifest.json", scopeUrl).href,
    new URL("sphen-icon-192.png", scopeUrl).href,
    new URL("sphen-icon-512.png", scopeUrl).href,
    new URL("apple-touch-icon.png", scopeUrl).href,
  ]);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try {
      const url = new URL(match[1], scopeUrl);
      if (url.origin === scopeUrl.origin && url.href.startsWith(scopeUrl.href)) urls.add(url.href);
    } catch {
      // Ignore malformed/non-fetchable markup references.
    }
  }
  await mapLimit([...urls], 6, async (url) => {
    try {
      const asset = await fetch(url, { cache: "no-cache" });
      if (asset.ok) await cache.put(url, asset.clone());
    } catch {
      // The root HTML is enough for install; runtime caching can fill optional assets.
    }
  });
}

async function isActuallyOnline() {
  try {
    const response = await fetch(connectivityUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function archiveManifestResponse(request, event) {
  if (await isActuallyOnline()) {
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(refreshOfflineArchiveFromResponse(response.clone()));
      return response;
    } catch {
      // Fall through to the dedicated 150-entry offline manifest.
    }
  }
  const cache = await caches.open(ARCHIVE_CACHE);
  const fallback = await cache.match(offlineManifestUrl);
  return fallback || new Response(JSON.stringify({ generatedAt: "", entries: [] }), {
    status: 503,
    headers: { "Content-Type": "application/json", "X-SphenPad-Offline": "1" },
  });
}

async function archivePuzzleResponse(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(ARCHIVE_CACHE);
    return (await cache.match(request)) || new Response("Offline puzzle is not cached", { status: 503 });
  }
}

async function appResponse(request, event) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(request, response.clone())));
    }
    return response;
  } catch {
    const cache = await caches.open(APP_CACHE);
    return (await cache.match(request)) || (request.mode === "navigate" ? await cache.match(scopeUrl.href) : undefined) || Response.error();
  }
}

function isExternalStatic(url) {
  return url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    (url.hostname === "sudokupad.app" && (url.pathname.startsWith("/images/") || url.pathname.startsWith("/assets/twemoji/") || url.pathname.startsWith("/assets/fonts/")));
}

async function externalStaticResponse(request) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const cache = await caches.open(EXTERNAL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.open(EXTERNAL_CACHE)).match(request) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([refreshAppShell(), refreshOfflineArchive(), cacheExternalStatic()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SPHENPAD_REFRESH_OFFLINE_ARCHIVE") event.waitUntil(refreshOfflineArchive());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.href === archiveManifestUrl) {
    event.respondWith(archiveManifestResponse(request, event));
    return;
  }
  if (url.href.startsWith(archivePuzzlePrefix)) {
    event.respondWith(archivePuzzleResponse(request));
    return;
  }
  if (url.origin === scopeUrl.origin && url.href.startsWith(scopeUrl.href)) {
    event.respondWith(appResponse(request, event));
    return;
  }
  if (isExternalStatic(url)) event.respondWith(externalStaticResponse(request));
});
