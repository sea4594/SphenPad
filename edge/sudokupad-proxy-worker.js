/**
 * Optional Cloudflare Worker for reliable SphenPad SudokuPad imports/assets.
 *
 * Routes:
 *   GET /puzzle/<id>                 -> https://sudokupad.app/api/puzzle/<id>
 *   GET /asset?url=<url>&kind=image  -> validated public image/font asset
 *
 * Set ALLOWED_ORIGIN to the deployed SphenPad origin (or leave unset for *).
 * Optional environment values:
 *   UPSTREAM_TIMEOUT_MS (default 8000)
 *   MAX_ASSET_BYTES (default 16777216 = 16 MiB)
 */
const DEFAULT_MAX_ASSET_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

function envNumber(env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
  };
}

function response(body, init, env) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isPrivateIpv6(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  return host === "::" || host === "::1" ||
    host.startsWith("fc") || host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("ff") ||
    host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.") || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function allowedAssetUrl(input, base) {
  const url = base ? new URL(input, base) : new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http/https assets are allowed");
  if (url.username || url.password) throw new Error("Authenticated URLs are not allowed");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error("Private-network assets are not allowed");
  }
  return url;
}

function validMime(kind, mime) {
  const value = (mime || "").split(";", 1)[0].trim().toLowerCase();
  if (kind === "font") return !value || value.startsWith("font/") || [
    "application/font-sfnt", "application/font-woff", "application/vnd.ms-fontobject",
    "application/octet-stream", "application/x-font-ttf", "application/x-font-opentype",
  ].includes(value);
  return value.startsWith("image/");
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Upstream request timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function boundedFetch(initialUrl, kind, env) {
  const maxBytes = envNumber(env, "MAX_ASSET_BYTES", DEFAULT_MAX_ASSET_BYTES);
  const timeoutMs = envNumber(env, "UPSTREAM_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  let url = allowedAssetUrl(initialUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const upstream = await fetchWithTimeout(url.href, {
      redirect: "manual",
      cf: { cacheEverything: true, cacheTtl: 86400 },
    }, timeoutMs);

    if (upstream.status >= 300 && upstream.status < 400) {
      if (redirects === MAX_REDIRECTS) return new Response("Too many redirects", { status: 508 });
      const location = upstream.headers.get("location");
      if (!location) return new Response("Redirect without location", { status: 502 });
      url = allowedAssetUrl(location, url);
      continue;
    }

    if (!upstream.ok) return upstream;
    const length = Number(upstream.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > maxBytes) return new Response("Asset too large", { status: 413 });
    if (!validMime(kind, upstream.headers.get("content-type"))) return new Response("Unsupported asset MIME type", { status: 415 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > maxBytes) return new Response("Asset too large", { status: 413 });
    const headers = new Headers(upstream.headers);
    headers.delete("set-cookie");
    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes, { status: 200, headers });
  }

  return new Response("Too many redirects", { status: 508 });
}

export const _test = { allowedAssetUrl, validMime, isPrivateIpv4, isPrivateIpv6, boundedFetch };

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return response(null, { status: 204 }, env);
    if (request.method !== "GET") return response("Method not allowed", { status: 405 }, env);

    try {
      if (url.pathname.startsWith("/puzzle/")) {
        const id = url.pathname.slice("/puzzle/".length).split("/").filter(Boolean).map(decodeURIComponent).map(encodeURIComponent).join("/");
        if (!id) return response("Missing puzzle ID", { status: 400 }, env);
        const timeoutMs = envNumber(env, "UPSTREAM_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
        const upstream = await fetchWithTimeout(`https://sudokupad.app/api/puzzle/${id}`, {
          redirect: "error",
          cf: { cacheEverything: true, cacheTtl: 3600 },
        }, timeoutMs);
        return response(upstream.body, { status: upstream.status, headers: upstream.headers }, env);
      }

      if (url.pathname === "/asset") {
        const original = url.searchParams.get("url");
        const kind = url.searchParams.get("kind") === "font" ? "font" : "image";
        if (!original) return response("Missing asset URL", { status: 400 }, env);
        const assetUrl = allowedAssetUrl(original);
        const upstream = await boundedFetch(assetUrl, kind, env);
        return response(upstream.body, { status: upstream.status, headers: upstream.headers }, env);
      }

      return response("Not found", { status: 404 }, env);
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
      return response(isTimeout ? "Upstream request timed out" : (error instanceof Error ? error.message : "Proxy error"), { status: isTimeout ? 504 : 400 }, env);
    }
  },
};
