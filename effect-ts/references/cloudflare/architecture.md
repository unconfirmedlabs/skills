# Worker architecture

Requires: [services](../services.md), [HTTP](../http.md).

## Boundary shape

Keep the dependency direction one-way:

```text
Cloudflare entrypoint -> Effect program -> domain/services -> binding adapters
                     <- Response        <- typed errors   <- tagged failures
```

The module export owns `Effect.runPromise`. Route handlers return Effects, and
services return Effects. This leaves one place to log defects, redact internal
details, and render the public failure contract.

Use a stable Fetch adapter for HTTP Workers:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/unstable/http/HttpRouter"

const { handler } = HttpRouter.toWebHandler(Routes, { disableLogger: true })

const dispatch = Effect.fn("worker.dispatch")(
  (request: Request, context: Context.Context<AppServices>) =>
    Effect.tryPromise({
      try: (signal) => {
        if (signal.aborted) return Promise.reject(signal.reason)
        return handler(new Request(request, { signal: AbortSignal.any([request.signal, signal]) }), context)
      },
      catch: (cause) => new DispatchFailure({ cause })
    })
)
```

`HttpRouter.toWebHandler` creates a cached adapter whose layer construction is
lazy on first use. Sharing it is appropriate when the built graph is immutable
and performs no invocation-bound I/O. Pass invocation-specific services in its Context argument.

## Request-scoped services

Generated `CloudflareBindings` types are the compile-time input. Decode
configuration values, then construct services around native bindings:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const ConfigInput = Schema.Struct({ API_ORIGIN: Schema.NonEmptyString })

class Api extends Context.Service<Api, {
  get(path: string): Effect.Effect<Response, ApiUnavailable>
}>()("app/Api") {}
```

Provide an R2 bucket, KV namespace, D1 database, service binding, AI binding, or
Durable Object namespace through a capability-specific service. Avoid a single
`EnvService` that exposes every binding to every route. Tests should be able to
provide an in-memory implementation without pretending to be the Cloudflare SDK.

Use `Layer` for a service with acquisition, finalization, or dependencies. A
plain request-scoped `Context` is enough for zero-lifecycle wrappers around
invocation bindings; do not create ceremony solely to say that a Layer exists.

## HTTP routing

Use `HttpApi` for a schema-first JSON contract shared with clients and OpenAPI.
Use `HttpRouter` for streaming, byte delivery, proxy fidelity, unusual methods,
or a small service where a full API schema adds little value.

With `HttpRouter`, register `GET` and `HEAD` deliberately when wildcard method
routes exist. Effect's automatic GET fallback for HEAD cannot run if a `*`
method route has already matched. Also avoid combining a `route("*", "*", ...)`
with explicit method-wide routes: their expanded method registrations collide.

Keep route adapters structural. Extract the original Web Request, obtain route
params, invoke the named program, render typed failures centrally, then convert
the response:

```ts
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"

const fromWebResponse = (response: Response) =>
  HttpServerResponse.raw(new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: response.headers
  }), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
```

For ordinary HTTP responses, the new Response gives mutable owned headers:
raw-to-Web conversion may mutate headers, and a fetch/redirect Response can have
immutable headers. Handle WebSocket upgrade responses separately using the host
adapter; this generic reconstruction does not preserve upgrade-specific fields.

This preserves response metadata and its streaming body when the native body
already owns its lifetime (e.g. a host-provided R2 body). Supplying outer metadata
lets Effect remove the body for HEAD while retaining status/headers.

It does **not** transfer a request Scope into a raw Response. In rc.115
`HttpEffect.scopeTransferToStream` transfers ownership only for an Effect Stream
body. If the body depends on an Effect-scoped connection/resource, use
`HttpServerResponse.stream(effectStream)` with acquisition inside that lifetime,
or implement an explicit native stream owner that finalizes on end/error/cancel.
Test consumption after the handler resolves and early cancellation. Merely
preserving bytes/headers is not proof that the source stays alive.

## Error interpretation

Expected domain and infrastructure errors stay typed until the HTTP boundary.
Map them to stable public codes and safe messages. Log infrastructure details
inside Effect, not in the response. Use catchDefect for defect-only recovery or
inspect Cause in catchCause: re-fail causes containing interruption before
rendering a generic no-store 500. Do not turn client cancellation into success.

Use distinct failures for binding operations so logs retain the operation and a
safe identifier:

```ts
class ObjectStoreFailure extends Schema.TaggedError<ObjectStoreFailure>()(
  "ObjectStoreFailure",
  {
    operation: Schema.Literals(["get", "put", "delete"]),
    key: Schema.String,
    cause: Schema.Defect()
  }
) {}
```

Never return raw exception messages, bucket names, provider names, or secrets in
public provenance headers. Public source labels should describe behavior such as
`cache | origin`, not infrastructure.

## Other entrypoints

- Queue: decode every message payload, process with bounded Effect concurrency,
  and translate the outcome deliberately into ack/retry/dead-letter behavior.
- Scheduled: one named Effect program; derive current time from Effect services
  where tests need control.
- Durable Object: keep the class as the Cloudflare lifecycle boundary and put
  domain transitions in pure functions or Effect services. Respect input/output
  gate semantics; do not use `waitUntil` as a normal keepalive mechanism.
- Tail/email/workflow: apply the same boundary rule—native event in, validated
  domain data, typed Effect program, explicit platform acknowledgement out.

Sources: [Effect importing guidance](https://effect.website/docs/v4/getting-started/importing-effect/),
[Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Effect HttpRouter API](https://github.com/Effect-TS/effect/blob/4a05d4914fa2327a42bd75fe77c22c188becf3b4/packages/effect/src/unstable/http/HttpRouter.ts).

## Binding-specific storage semantics

D1Client supports atomic fixed batches, not SqlClient.withTransaction or query
streaming in rc.115. Durable Object SQLite supports transactions with the full
storage object, not only storage.sql, and rejects nested transactions. See
[SQL and persistence](../sql-and-persistence.md). Effect Workflow and Cloudflare
Workflows are different engines: choose which owns replay and step identity.
