# Cloudflare runtime and build

Requires: [services](../services.md), [streams](../streams.md).

## Bindings and configuration

Define bindings in `wrangler.jsonc` and run `wrangler types` after every config
change. Prefer the generated environment interface over handwritten ambient
types. Environment blocks do not inherit every top-level Wrangler key; verify
the rendered configuration for each deployed environment rather than assuming.

Types do not validate deployed strings. Decode vars such as origins, modes,
tenant IDs, and numeric limits with Schema before constructing services. Secrets
remain secret bindings and must never enter logs, errors, cache keys, or public
headers.

Wrap native binding calls at the service boundary:

```ts
const get = Effect.fn("objects.get")((key: string) =>
  Effect.tryPromise({
    try: () => bucket.get(key),
    catch: (cause) => new ObjectStoreFailure({ operation: "get", key, cause })
  })
)
```

Keep binding objects request-scoped. Cloudflare may reuse an isolate for many
requests, but request-scoped I/O can fail or leak data when captured and reused
across invocations.

## Cancellation and background work

`Effect.tryPromise` supplies an `AbortSignal`; pass it to `fetch` and any API
that accepts cancellation. Wire the incoming Request.signal to the outer runner and propagate the supplied
signal through any newly constructed Request sent to the Web handler. Merely
checking signal.aborted once does not propagate later timeout/cancellation.
A binding that has no cancellation API can finish remotely after interruption.

The Fetch response must await all work needed for correctness. For optional
post-response work, turn the background Effect into a Promise only at the
entrypoint and pass it to `ctx.waitUntil`. Observe failure inside the Effect and let the waitUntil-owned Promise reflect
its actual exit (Cloudflare observes rejection):

```ts
const background = audit(event).pipe(
  Effect.tapCause((cause) => Effect.logError("audit failed", cause))
)

ctx.waitUntil(Effect.runPromise(background))
```

Keep background work bounded by the platform's lifetime. Use Queues or Workflows
for work that needs durable delivery, long execution, or retry guarantees.

## Streaming and Web responses

- Return `ReadableStream` bodies directly. R2 object bodies and upstream Fetch
  bodies already stream; buffering them raises latency and memory consumption.
- Preserve status, status text, headers, validators, content length/range, and
  the original body when proxying. Remove hop-by-hop headers deliberately.
- Do not call `arrayBuffer`, `text`, or `json` unless transformation actually
  requires the complete body.
- Keep the original Request's signal on upstream Fetches.
- Test backpressure-sensitive or byte-sensitive routes with the deployed
  runtime as well as local workerd.

## Imports and tree shaking

Write the library in Effect's public namespace-subpath form:

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
```

Do not use `import { Effect, Schema } from "effect"` or
`import { HttpRouter } from "effect/unstable/http"` in Worker application code.
Named barrel imports require deep-scope analysis. Effect documents Rolldown,
Rollup, and Webpack 5+ as supporting it; Wrangler's production bundler is
esbuild. Public subpaths express the dependency precisely and work with either
toolchain, so they are not a Wrangler-specific workaround.

Measure instead of guessing. A minified dry run reports total and gzip size:

```sh
bunx wrangler deploy --dry-run --minify
bunx wrangler deploy --dry-run --minify --metafile dist/meta.json
```

Inspect the metafile when a change materially grows the Worker. Compare the same
entrypoint, minification, compatibility flags, and dependency versions.

## Wrangler or Vite

Use Wrangler directly for an API, event consumer, Durable Object service, or
backend Worker. It owns binding configuration, local development, type
generation, dry runs, versions, and deployment; its built-in bundling is enough.

Use the Cloudflare Vite plugin when the project already benefits from Vite: a
frontend/full-stack framework, Vite plugins, asset graph, SSR build, or a shared
browser/Worker build. Do not adopt Vite only to compensate for barrel imports.
Keep Effect subpath imports under both build systems.

The Cloudflare Vitest plugin uses Vite to run tests in workerd. That does not
require using Vite as the production Worker build.

Sources: [Effect imports and tree shakeability](https://effect.website/docs/v4/getting-started/importing-effect/),
[Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/),
[Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/),
[Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/).
