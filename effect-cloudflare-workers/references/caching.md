# Workers caching

Cloudflare now has two different mechanisms whose names are easy to conflate.
Choose deliberately.

## Workers Cache versus Cache API

Workers Cache (`cache.enabled` in Wrangler) sits in front of Worker `fetch`
entrypoints. It is regionally tiered, collapses concurrent misses, can serve a
hit without invoking the Worker, and reports the result in `Cf-Cache-Status`.
This is the default choice for globally reusable HTTP output.

The Cache API (`caches.default`) runs inside the Worker after invocation. Its
entries are local to a data center, do not replicate, do not participate in
tiered caching, and do not collapse concurrent misses. Use it only when code
needs explicit PoP-local cache operations and those semantics are desired.

Never label an R2/object-store hit as a CDN cache hit. `Cf-Cache-Status` answers
whether Workers Cache served the request; application provenance can separately
use infrastructure-neutral values such as `cache | origin`.

## Safe defaults

If Workers Cache is enabled, responses with no `Cache-Control` may receive
heuristic freshness. Every response must state intent:

- reusable: `public, max-age=N` plus validators when useful;
- user-specific, error, health, mutation, or otherwise fresh: `no-store` or
  `private` as appropriate;
- use `cdn-cache-control` or `cloudflare-cdn-cache-control` when browser and edge
  TTLs intentionally differ.

Only GET/HEAD are cached. GET and HEAD share an entry. Authorization,
`Set-Cookie`, `private`, and `no-store` commonly trigger bypass. `no-cache` means
store but revalidate; it is not the same as bypassing storage.

By default the Worker version is part of the cache key. Keep it that way unless
old responses are provably compatible with new code. `cross_version_cache: true`
improves warm-hit continuity but a deploy no longer invalidates output; require
a versioned key or explicit purge plan.

## Gateway pattern

When only some requests are reusable, leave the default gateway uncached and
delegate eligible requests to a cache-enabled named entrypoint through
`ctx.exports`:

```jsonc
{
  "compatibility_date": "2026-09-11",
  "cache": { "enabled": true },
  "exports": {
    "default": { "type": "worker", "cache": { "enabled": false } },
    "Cacheable": { "type": "worker", "cache": { "enabled": true } }
  }
}
```

```ts
import { WorkerEntrypoint } from "cloudflare:workers"

export class Cacheable extends WorkerEntrypoint<CloudflareBindings> {
  override fetch(request: Request): Promise<Response> {
    return handleRequest(request, this.env)
  }
}

export default {
  fetch(request, env, ctx) {
    return isReusable(request)
      ? ctx.exports.Cacheable.fetch(request)
      : handleRequest(request, env)
  }
} satisfies ExportedHandler<CloudflareBindings>
```

`ctx.exports` is enabled by compatibility date 2025-11-17 and later; older
dates require `enable_ctx_exports`. Per-entrypoint caching requires Wrangler
4.107.0 or later. A custom RPC method bypasses Workers Cache; delegate with
`fetch()` when the operation must be cached.

Do not enable cache on the gateway and return `no-store` for most paths: each
request would still pay for lower/upper-tier lookup. Per-entrypoint disablement
avoids that cost.

## Cache keys and trust boundaries

The key includes the entrypoint, path/query, `ctx.props`, and normally Worker
version; hostname is not a partition. Normalize query parameters before
delegation if ordering is not semantically meaningful. Partition authenticated
or multi-tenant content with trusted `ctx.props` or a same-account custom key,
not an untrusted client header that is absent from the key.

Use `Vary` only for bounded representation dimensions. `Vary: *` disables
caching, and raw header values can create unbounded variants.

## Range and streaming

Workers Cache strips `Range` on a miss, invokes the cacheable entrypoint for a
complete `200`, stores it, then returns the requested `206` slice. A Worker-made
`206` is not admitted. For an ordinary byte-addressable resource, return the
full response from the cacheable entrypoint and let Workers Cache slice it.

If an endpoint intentionally ignores Range or gives Range different semantics,
the gateway must bypass the cache-enabled entrypoint for ranged requests.
Otherwise Cloudflare can change its contract by synthesizing `206`.

Streaming responses are cacheable and concurrent misses can join the in-flight
stream. Do not buffer the body. Still test exact bytes on origin/mirror paths,
cached and uncached requests, whole reads, and representative ranges.

## Verification

Local tests prove cache policy routing and response headers, not the global
cache. After deployment, request a fresh key twice and expect `MISS` then `HIT`
in `Cf-Cache-Status`. Compare body hashes and headers. Repeat Range probes and
confirm a cold ranged request still receives the correct bytes.

Sources: [Workers Cache overview](https://developers.cloudflare.com/workers/cache/),
[configuration](https://developers.cloudflare.com/workers/cache/configuration/),
[cache keys](https://developers.cloudflare.com/workers/cache/cache-keys/),
[limitations](https://developers.cloudflare.com/workers/cache/limitations/),
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
