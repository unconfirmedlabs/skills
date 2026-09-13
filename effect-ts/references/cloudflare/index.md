# Effect on Cloudflare Workers

Requires: [core](../core.md), [services](../services.md), [HTTP](../http.md).
Also read [library](../library/index.md) when consuming/exposing a reusable package,
and [migration](../migration.md) for an existing application.

Cloudflare owns execution lifetime. Use Effect for domain programs and binding
adapters, with native Request/Response/event values at the boundary. Invocation
bindings belong in an invocation Context or scoped Layer. Share immutable router
construction only when it performs no invocation I/O.

| Concern | Read |
|---|---|
| Router, services, errors, queue/scheduled/DO edges | [Architecture](architecture.md) |
| Bindings, cancellation, streaming, Wrangler and bundle imports | [Runtime and build](runtime-and-build.md) |
| Cache keys, policy, Range and gateway semantics | [Caching](caching.md) |
| workerd tests, exact bytes, type generation and dry run | [Testing and deployment](testing-and-deployment.md) |

For a new HTTP Worker, copy `assets/cloudflare-worker/` from the skill root,
rename Worker/service identifiers, install dependencies and run `bun run check`.
It checks generated binding types, TypeScript, workerd behavior and a minified
dry run. A Worker needs no platform-bun/platform-node runtime.

Await correctness-critical work. Use `ctx.waitUntil` for bounded optional work
and Queues/Workflows for durable delivery. Detached fibers are not durable jobs.
Binding calls without AbortSignal support remain remotely non-cancellable. Queue
retries, DO restarts and alarm redelivery need idempotency.

Prefer HttpApi for shared JSON contracts and HttpRouter for response control.
Retain an existing framework when its contract matters. Use namespace subpaths
with Wrangler and measure bundle size. Deployment follows the user's task scope.
