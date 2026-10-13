# Services, resources, configuration and runtime ownership

Requires: [core](core.md).

## Services and Layers

A `Context.Service<Self, Shape>()("package/Name")` is a typed capability key.
`yield* Service` gets its implementation. Its **string key** is its runtime
identity: avoid unrelated keys with the same string and preserve published keys.
Use a method parameter for per-call input; use a service for scoped capabilities
or ambient identity when callers should require it. Credentials can use either
shape if lifetime, concurrency and tenant isolation are explicit.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

class Greeting extends Context.Service<Greeting, {
  hello(name: string): Effect.Effect<string>
}>()("app/Greeting") {}

const GreetingLive = Layer.succeed(Greeting, {
  hello: (name) => Effect.succeed(`Hello, ${name}`)
})
const program = Effect.gen(function*() {
  const greeting = yield* Greeting
  return yield* greeting.hello("Effect")
}).pipe(Effect.provide(GreetingLive))
```

Static `layer`, `layerNoDeps`, and `layerTest` fields are useful conventions, not
runtime requirements. Export named layers where module separation is clearer.
Use `Context.make`/`Effect.provideService` for already-created values; use
`Layer.effect` when construction is effectful, dependent or scoped.

`Layer<Provides, Error, Requires>` describes construction, not the methods' error
channels. Keep service methods' remaining requirements visible or capture them
intentionally when constructing the implementation. A startup error remains a
recoverable Layer error unless the application deliberately terminates startup.
Do not replace all infrastructure errors with defects.

| Composition | Meaning |
|---|---|
| `Layer.provide(deps)` | Satisfy inputs and hide those supplied dependencies from the output |
| `Layer.provideMerge(deps)` | Satisfy inputs and retain supplied services in the output |
| `Layer.mergeAll(...)` | Combine outputs; arrange dependency provisioning explicitly |
| `Layer.effect(Service, make)` | Build a service; scoped acquisitions belong to the Layer lifetime |
| `Layer.effectDiscard(make)` | Startup/background work without exporting a service |
| `Layer.unwrap` / `Layer.suspend` | Choose a Layer effectfully / defer its construction |
| `Layer.fresh` | Explicitly bypass normal sharing for a build |
| `Layer.build` / `Layer.launch` | Build in a Scope / keep the composed application alive |

Layers memoize by Layer object identity within a memo map; calling a layer
factory twice may create two instances. v4 nested provisions can share the memo
map; `{ local: true }` on `Effect.provide` isolates it. Tests must verify the
intended shared/fresh lifetime rather than assuming a new service per `provide`.

`Context.Reference` holds overridable defaults without adding a required service.
Use it for ambient policy with a safe default (logging, tracing, local options).
A default in-memory store is inappropriate when the contract requires durability:
make the durable store a required service so omission is visible.

### Wrapping a Promise SDK as a service

Construct the client in the Layer, map each SDK failure to the service's tagged
errors in `catch`, forward the `AbortSignal`, decode the untrusted result, and
keep timeout/retry inside the method so callers see one typed contract. Retry
reads; retry writes only when idempotent (see [resilience](resilience.md)).

```ts
class ChainUnavailable extends Schema.TaggedError<ChainUnavailable>()("ChainUnavailable", { cause: Schema.Defect() }) {}
class ObjectNotFound extends Schema.TaggedError<ObjectNotFound>()("ObjectNotFound", { id: Schema.String }) {}
const ChainObject = Schema.Struct({ id: Schema.String, version: Schema.String })

class Chain extends Context.Service<Chain, {
  getObject(id: string): Effect.Effect<typeof ChainObject.Type, ChainUnavailable | ObjectNotFound | Schema.SchemaError>
}>()("app/Chain") {
  static readonly layer = Layer.effect(Chain, Effect.gen(function*() {
    const sdk = makeSdk(yield* Config.String("CHAIN_URL"))          // foreign Promise client
    const getObject = Effect.fn("Chain.getObject")(function*(id: string) {
      const raw = yield* Effect.tryPromise({
        try: (signal) => sdk.getObject({ id, signal }),               // interruption/timeout aborts the request
        catch: (cause) => isNotFound(cause) ? new ObjectNotFound({ id }) : new ChainUnavailable({ cause })
      }).pipe(
        Effect.timeout("5 seconds"),                                  // per attempt
        Effect.catchTag("TimeoutError", (cause) => Effect.fail(new ChainUnavailable({ cause }))),
        Effect.retry({ schedule: Schedule.exponential("200 millis").pipe(Schedule.jittered), times: 3,
          while: (e) => e._tag === "ChainUnavailable" })
      )
      return yield* Schema.decodeUnknownEffect(ChainObject)(raw)
    })
    return Chain.of({ getObject })
  }))
  static readonly layerTest = (objects: ReadonlyArray<typeof ChainObject.Type>) =>
    Layer.succeed(Chain, Chain.of({
      getObject: (id) => {
        const found = objects.find((o) => o.id === id)
        return found ? Effect.succeed(found) : Effect.fail(new ObjectNotFound({ id }))
      }
    }))
}
```

The test layer keeps the same key and error types. Effect-level tests provide it
instead of the live Layer; see [testing](testing-and-observability.md).

## Resources

Use `Effect.acquireRelease`/`acquireUseRelease` and `Effect.addFinalizer` to couple
acquisition and release. `Effect.scoped` closes the scope at completion; Layers
close their scope on disposal/shutdown. Finalizers also run on failure and
interruption. Finalizer failure is meaningful evidence; observe it rather than
assuming release can never fail. Interruption can wait for uninterruptible
acquisition/finalization, so a timeout is not necessarily a hard wall-clock limit.

Keep resources open until their last consumer finishes. Returning a lazy Stream
from inside `Effect.scoped` may close its connection too early; either acquire
within the Stream or let the consuming scope own the connection. Apply the same
rule to HTTP response bodies and foreign AsyncIterables.

| Lifetime problem | Primitive |
|---|---|
| Finite resource set with scoped borrowing | `Pool`; scope each borrow and validate/invalidate unusable resources |
| One shared resource while referenced | `RcRef`; reference count governs acquisition/release |
| Shared resources by key | `RcMap`; set idle TTL and key cardinality policy |
| Shared service Layers by key | `LayerMap`; preserves Layer construction and dependency semantics |
| Replace a resource / a Layer | `ScopedRef` / `LayerRef`; specify what existing users observe during replacement |
| Refresh a scoped value | `Resource`; handle refresh failure and old-value lifetime explicitly |
| Cache entries that own resources | `ScopedCache`; eviction/replacement must release resources |

Do not keep request/tenant credentials in a singleton resource lookup that
captures the first caller's Context. Test acquisition count, concurrent sharing,
release after the last user, eviction, refresh failure and shutdown.

## Configuration

Read `Config` inside application construction. `Config.String`, `Int`, `Boolean`,
`Duration`, `URL`, `Redacted`, `schema`, `all`, `nested`, `option`, `withDefault`
cover common inputs. Provide `ConfigProvider` for env records, structured values,
dotenv/files or layered sources. Inspect exact constructors in the installed API.
Tests inject a provider; they do not depend on the developer's environment.

`Redacted` suppresses normal inspection; explicitly unwrapping, encoding or
interpolating the underlying value can still leak it. Boundary errors and
telemetry must use a deliberate public representation.

## Entrypoints and bridges

Process apps use the appropriate platform `runMain` for signal handling and
shutdown, often around `Layer.launch(AppLayer)`. Core `Effect.runPromise` is fine
at an owned script/test/host boundary, with failure and disposal accounted for.
No run call belongs inside an ordinary composable library method.

`ManagedRuntime.make(AppLayer)` bridges a foreign host to one composed Layer.
Dispose it when the host lifetime ends. Its initial build, including failure,
is memoized; recoverable startup may need retry during construction or explicit
replacement/disposal of the failed runtime. Do not recreate expensive long-lived
resources on every method call or retain request-scoped resources indefinitely.

For a SPA, an application runtime can live with the mounted app and be disposed
on teardown. For SSR, separate user/request data and AtomRegistry per request;
a process-global user runtime can leak identity or cached output.

## Edges without a platform runtime

Cloudflare owns invocation/DO lifetime, so no Node/Bun process runtime is needed.
A module-level immutable router or runtime may be reused only for services that
are safe across invocations and perform no invocation-bound I/O. Build binding
wrappers from the current `env` and pass them through the invocation Context.
A Durable Object instance can own instance state; storage remains the source of
truth across restarts. In-memory locks do not coordinate different isolates or
survive restarts. Read [Cloudflare](cloudflare/index.md) for native lifetimes.

## Batching

Use `Request` + `RequestResolver` when many concurrent logical reads share a bulk
backend operation. Fulfill each request exactly once, map missing/duplicate IDs,
and preserve request order where the contract requires it. Resolver caches can
capture services; key tenant/auth dimensions or scope the resolver accordingly.
See [resilience](resilience.md) for cache lifetime and failure caching.

Source: pinned `Context.ts`, `Layer.ts`, `ManagedRuntime.ts`, `Scope.ts` and
resource modules, discoverable in [the inventory](source-and-coverage.md).
