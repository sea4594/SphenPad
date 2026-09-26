# Optional SudokuPad edge proxy

SphenPad can work without this worker when browser CORS permits direct access, but the proxy makes remote puzzle and external asset loading deterministic on static hosting.

Deploy `sudokupad-proxy-worker.js` as a Cloudflare Worker and configure:

- `ALLOWED_ORIGIN` — exact deployed SphenPad origin (recommended; `*` is the fallback).
- `UPSTREAM_TIMEOUT_MS` — optional positive integer, default `8000`.
- `MAX_ASSET_BYTES` — optional positive integer, default `16777216` (16 MiB).

Then build SphenPad with:

```text
VITE_SUDOKUPAD_PROXY_BASE=https://<worker-host>
```

The client only uses the worker for SudokuPad puzzle IDs and sanitized public image/font assets. The worker is not intended to be a general unrestricted proxy.

Production safety behavior:

- GET/OPTIONS only;
- explicit CORS response headers and `nosniff`;
- http/https assets only, no URL credentials;
- localhost, literal private/link-local/reserved IPv4, and private/link-local IPv6 rejected;
- redirects are followed manually and each redirect target is revalidated;
- maximum five redirects;
- MIME validation for image/font assets;
- response size enforcement both from `Content-Length` and actual downloaded bytes;
- upstream request timeout;
- upstream `Set-Cookie` is not forwarded for asset responses.

Run `npm run test-sudokupad-proxy` before deploying changes to the worker.
