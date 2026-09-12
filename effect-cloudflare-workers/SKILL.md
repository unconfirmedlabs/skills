---
name: effect-cloudflare-workers
description: Build, migrate, or review Cloudflare Workers written with Effect v4. Use for Fetch entrypoints, Effect HttpRouter or HttpApi, Worker bindings, R2/KV/D1/Queues/Durable Objects, ctx.waitUntil, streaming or byte-range responses, Workers Cache, Wrangler configuration, workerd/Vitest tests, bundle size, and deployment. Use alongside effect-ts for shared Effect architecture. Not for Node/Bun servers or generic Effect code with no Cloudflare runtime concerns.
---

# Effect v4 on Cloudflare Workers

Use Effect as the application architecture and Cloudflare's Web APIs as the
runtime boundary. Keep the exported Worker handler thin: turn invocation
bindings into request-scoped Effect services, run one named Effect program, and
interpret every typed failure before returning a `Response`.

This is a sibling of `effect-ts`, not an extension inside it. Apply the base
skill's domain, Schema, service, Layer, and error invariants as well. The one
Worker-specific adaptation is that zero-lifecycle services constructed from an
invocation's bindings may be supplied in a request Context instead of declaring
a static Layer; use Layers when construction has effects, dependencies, or a
lifecycle. If the sibling skill is available in the checkout but has not been
loaded, read `../effect-ts/SKILL.md` and only the base references needed by the
task.

Target the exact installed Effect v4 release candidate. APIs under
`effect/unstable/*` can change between release candidates; verify them against
the installed declarations before editing.

## Invariants

- Use public namespace subpath imports: `import * as Effect from
  "effect/Effect"` and `import * as HttpRouter from
  "effect/unstable/http/HttpRouter"`. Do not import modules from the `effect`
  root barrel or unstable family barrels. This is canonical Effect syntax and
  remains tree-shakeable under Wrangler's esbuild pipeline.
- Use `HttpRouter.toWebHandler` or `HttpApi` as the Fetch adapter. Do not add a
  second HTTP framework unless an existing contract requires it.
- Keep `fetch`, `queue`, `scheduled`, and Durable Object entrypoints as thin
  interpreters. Call `Effect.runPromise` only there, never in domain or service
  code.
- Decode request data, environment variables, and external payloads with
  `Schema`. Wrap binding and Fetch Promises with `Effect.tryPromise` and tagged
  failures.
- Build services from each invocation's `env`; never capture binding-backed or
  request-scoped I/O in mutable module globals. Module-global immutable router
  and runtime construction is fine when it performs no request I/O.
- Preserve Web `Request`, `Response`, `ReadableStream`, `AbortSignal`, status,
  and headers at the boundary. Do not buffer a streaming body just to enter
  Effect.
- Await response-critical work. Send optional bounded work to `ctx.waitUntil`
  and make its failure observable. Never leave a floating Promise.
- Generate binding/runtime types with `wrangler types`, but still validate
  runtime configuration. Type declarations cannot prove deployed values.
- Test the exact exported handler in `workerd` with
  `@cloudflare/vitest-plugin`, plus focused Effect programs with test services.
  A Node-only mock suite is insufficient for Worker behavior.
- Run typecheck, tests, and a minified Wrangler dry run before deployment. Pin
  Effect exactly; upgrade unstable APIs deliberately.

## Workflow

1. Read the applicable references below and inspect `wrangler.jsonc`, generated
   binding types, compatibility date/flags, entrypoints, and existing tests.
2. Start from `assets/template/` for a new HTTP Worker. Copy it into the target,
   rename the Worker and service identifiers, then run `bun install` and
   `bun run check`.
3. Define domain schemas and tagged failures first. Put Cloudflare bindings
   behind small Effect services, with live constructors from `env` and in-memory
   test constructors.
4. Implement named route or event programs. Keep response policy explicit:
   status, content type, cacheability, CORS, validators, and streaming.
5. Wire services once per invocation and adapt through the Worker entrypoint.
6. Test success, every public failure, methods, HEAD, cancellation/background
   work, and each binding. For bytes or streams, compare exact bytes across all
   source/cache paths and representative ranges.
7. Measure the minified bundle and inspect a metafile when it grows. Deploy only
   when the user asks; smoke-test the deployed route and cache behavior.

## References

Read only what the task needs; combine them when a concern crosses boundaries.

| Situation | Read |
|---|---|
| Entrypoints, router wiring, errors, services, Response fidelity | [architecture](references/architecture.md) |
| Bindings, runtime constraints, background work, streams, build-tool choice | [runtime-and-build](references/runtime-and-build.md) |
| Unit/integration tests, binding tests, bytes, dry runs, deployment | [testing-and-deployment](references/testing-and-deployment.md) |
| Workers Cache, Cache API, gateways, keys, Range, validation | [caching](references/caching.md) |

## Review failures

Reject root/barrel Effect imports in a Worker; framework wrappers around Effect;
raw binding calls spread through handlers; `runPromise` below an entrypoint;
unvalidated env or request input; thrown expected errors; mutable request state
in module scope; lost `AbortSignal`; buffered passthrough streams; implicit cache
policy; custom `caches.default` use presented as global caching; Node-only Worker
tests; or a deployment without a dry run and relevant smoke tests.
