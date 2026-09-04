# Services, layers, configuration, runtime

## Define a service

```ts
import { Context, Effect, Layer, Schema } from "effect"

export class UserRepoError extends Schema.TaggedError<UserRepoError>()("UserRepoError", { cause: Schema.Defect() }) {}

export class UserRepo extends Context.Service<UserRepo, {
  findById(id: UserId): Effect.Effect<Option.Option<User>, UserRepoError>
  readonly count: Effect.Effect<number>
}>()("myapp/users/UserRepo") {
  // implementation that still needs its own dependencies
  static readonly layerNoDeps: Layer.Layer<UserRepo, never, SqlClient.SqlClient> = Layer.effect(
    UserRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const findById = Effect.fn("UserRepo.findById")(function*(id: UserId) { ... })
      return UserRepo.of({ findById, count: sql`SELECT count(*) ...`.pipe(...) })
    })
  )
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(SqlLive))          // fully provided
  static readonly layerTest = Layer.effect(UserRepo, Effect.gen(function*() { const store = yield* Ref.make(...); return UserRepo.of({...}) }))
}
export type UserRepoService = UserRepo["Service"]
```

- Type parameters first (`<Self, Shape>()`), then the identifier. Identifiers
  are path-like and globally unique; they are the runtime key.
- Interface methods return Effects with domain errors only; infrastructure
  errors are wrapped (`cause: Schema.Defect()`) or turned into defects.
- `Service.of(impl)` types the implementation; `yield* Service` retrieves it;
  `Service.use((s) => s.method())` / `useSync` for one-off access.
- Function form for a plain value: `const Port = Context.Service<number>("myapp/Port")`.
- `Context.Service<Self>()("id", { make: Effect.gen(...) })` stores a `make`
  effect on the class; still define `static layer = Layer.effect(this, this.make)`.
  No `dependencies` option and no automatic `.Default` in v4.
- Settings with defaults, overridable per fiber:
  `const FeatureFlag = Context.Reference<boolean>("myapp/FeatureFlag", { defaultValue: () => false })`,
  read with `yield* FeatureFlag`, override with `Effect.provideService(effect, FeatureFlag, true)`.
  Built-ins live in `References` (`MinimumLogLevel`, `CurrentLogAnnotations`, `TracerEnabled`, ...).

## Layers

`Layer<Provides, Error, Requires>` builds services, owns their resources, and
is memoized by object identity within a build.

```ts
Layer.succeed(Service, impl); Layer.sync(Service, () => impl)
Layer.effect(Service, effect)              // effect may use Scope: acquireRelease/addFinalizer inside is released on teardown (replaces Layer.scoped)
Layer.effectDiscard(effect)                // run something (migrations, background fiber) without providing a service
Layer.unwrap(Effect<Layer>)                // choose a layer from Config or an effect
Layer.suspend(() => layer); Layer.empty; Layer.mock(Service, partialImpl); Layer.succeedContext(ctx)
Layer.provide(deps)(layer)                 // satisfy layer's requirements, hide deps
Layer.provideMerge(deps)(layer)            // satisfy and also expose deps
Layer.merge(a, b); Layer.mergeAll(a, b, c); Layer.provide([a, b])   // arrays accepted
Layer.fresh(layer)                         // opt out of memoization
Layer.orDie(layer); Layer.catchTag(...); Layer.catchCause(...); Layer.tap(...); Layer.tapCause(...); Layer.withSpan("startup")(layer)
Layer.updateService(Service, (s) => s2)(layer)
Layer.launch(layer)                        // Effect<never>: build, keep alive until interrupted, tear down
const ctx = yield* Layer.build(layer)      // Context in the current Scope
Layer.buildWithMemoMap(layer, memoMap, scope); Layer.makeMemoMapUnsafe()
```

Composition rules:

1. Each service file exports `layer` (fully wired) and `layerNoDeps` when the
   wiring is heavy; tests import `layerNoDeps` and provide fakes.
2. `main.ts` composes once: `const AppLayer = Layer.mergeAll(Http, Worker).pipe(Layer.provide(Infra))`.
3. Provide infrastructure (SQL, HTTP client, config provider, logger, tracer)
   last and outermost so every layer shares one instance.
4. Layers are built once per `MemoMap`. Nested `Effect.provide` calls share
   the map in v4; `Effect.provide(layer, { local: true })` isolates (tests).
5. A layer error (`E`) fails startup. Use `Layer.orDie` for infra that cannot
   be recovered, or `Layer.unwrap` with `Config` to pick fallbacks.

Background work: `Layer.effectDiscard(Effect.forkScoped(loop))`; the fiber is
interrupted when the layer scope closes (process shutdown via `runMain`).

Dynamic keyed resources (per tenant, per model):

```ts
class PoolMap extends LayerMap.Service<PoolMap>()("app/PoolMap", { lookup: (tenant: string) => DatabasePool.layer(tenant), idleTimeToLive: "1 minute" }) {}
effect.pipe(Effect.provide(PoolMap.get("acme")))      // builds on first use, cached, released when idle
yield* PoolMap.invalidate("acme")
```

Other resource holders: `Pool.make({ acquire, size })` (connection pools),
`RcMap.make({ lookup, idleTimeToLive })` (ref-counted scoped values by key),
`RcRef.make({ acquire })`, `ScopedRef.fromAcquire` (hot swap), `ScopedCache`.

## Configuration

```ts
const AppConfig = Config.all({
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
  dbUrl: Config.redacted("DATABASE_URL"),                 // Redacted<string>; Redacted.value(r) to read
  env: Config.literals(["development", "production"], "NODE_ENV").pipe(Config.withDefault("development")),
  timeout: Config.duration("TIMEOUT").pipe(Config.withDefault("30 seconds")),
  features: Config.schema(FeatureFlags, "FEATURES"),      // any Schema decoded from a string
  smtp: Config.all({ host: Config.string("HOST"), pass: Config.redacted("PASS") }).pipe(Config.nested("SMTP"))   // SMTP_HOST, SMTP_PASS
})
const cfg = yield* AppConfig                              // Config is yieldable; fails with ConfigError
```

Constructors: `string, nonEmptyString, number, int, finite, boolean, duration,
port, url, date, logLevel, redacted, literal, literals, schema, succeed, fail`;
combinators `withDefault, option, orElse, map, mapOrFail, all, nested, unwrap`.
Sources: default provider reads environment variables. Override with
`ConfigProvider.layer(ConfigProvider.fromUnknown({...}))`, `fromEnvRecord(env)`,
`fromDotEnv()`, `fromDir({ rootPath })`, `constantCase`, `nested`, `orElse(fallbackProvider)`;
`ConfigProvider.layerAdd(provider)` composes with the current one.
Read config inside layers, never at module top level, so tests inject values.

## Running and bridging

```ts
BunRuntime.runMain(Layer.launch(AppLayer))                   // servers, workers
BunRuntime.runMain(program.pipe(Effect.provide(AppLayer)))   // one-shot

const runtime = ManagedRuntime.make(AppLayer, { memoMap: Layer.makeMemoMapUnsafe() })
await runtime.runPromise(effect); runtime.runSync(effect); runtime.runFork(effect); runtime.runCallback(effect, { onExit })
await runtime.dispose()                                      // runs finalizers; call on SIGINT/SIGTERM
const ctx = yield* Effect.context<Users>(); Effect.runPromiseWith(ctx)(effect)   // capture services for callbacks
```

## Batching and deduplication

```ts
class GetUser extends Request.Class<{ readonly id: number }, User, UserNotFound> {}
const resolver = yield* RequestResolver.make<GetUser>(Effect.fn(function*(entries) {
  const rows = yield* db.usersByIds(entries.map((e) => e.request.id))
  for (const entry of entries) entry.completeUnsafe(rows.has(entry.request.id) ? Exit.succeed(rows.get(entry.request.id)!) : Exit.fail(new UserNotFound({ id: entry.request.id })))
})).pipe(RequestResolver.setDelay("10 millis"), RequestResolver.withSpan("Users.resolver"), RequestResolver.withCache({ capacity: 1024 }))
const getUser = (id: number) => Effect.request(new GetUser({ id }), resolver)
// Effect.forEach(ids, getUser, { concurrency: "unbounded" }) -> one batched call, duplicates deduped
```

## Checklist

- One service per file, interface first, then layers. No module-level state.
- Every external system behind a service with a `layerTest`.
- `main.ts` is the only file that composes infrastructure layers.
- Config read via `Config` inside layers; secrets as `Config.redacted`.
- Long-lived fibers are `forkScoped` inside layers, never `forkDetach`.
