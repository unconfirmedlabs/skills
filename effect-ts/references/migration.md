# Migration: v3 to v4, and adopting Effect in existing code

## Adopt Effect incrementally (non-Effect codebase)

Keep the project shippable after every step. Order by impact.

1. **Bridge at the edges.** Create `src/runtime.ts`:
   ```ts
   export const runtime = ManagedRuntime.make(AppLayer, { memoMap: Layer.makeMemoMapUnsafe() })
   // in a handler: await runtime.runPromise(effect)
   // shutdown:     runtime.dispose()
   ```
   Existing Hono/Express/Bun.serve handlers call `runtime.runPromise`; nothing
   else changes. `AppLayer` starts as `Layer.empty` and grows.
2. **Schema at boundaries.** Replace manual validation of request bodies, env,
   JSON files, and DB rows with `Schema.Class` / `Schema.Struct` and
   `Schema.decodeUnknownEffect`. Export the types from `domain/`. This is where
   most runtime bugs live and where every later step gets its types.
3. **Wrap externals as services.** For each SDK/DB/HTTP client: define
   `Context.Service` with an interface of `Effect`-returning methods, implement
   with `Effect.tryPromise({ try, catch: (cause) => new XError({ cause }) })`,
   attach `static layer`. Add it to `AppLayer`. Callers still use the runtime.
4. **Replace control flow.** Hand-written retry loops, `Promise.all`,
   `setTimeout` races, and `AbortController` become `Effect.retry`,
   `Effect.forEach({ concurrency })`, `Effect.timeout`, interruption.
5. **Move state.** Module-level mutable variables become `Ref`/`SubscriptionRef`
   inside a service with explicit transition functions.
6. **Flip the entrypoint.** When handlers are all Effects, replace the framework
   router with `HttpApi`/`HttpRouter` and `Layer.launch`, or keep the framework
   and leave the runtime bridge; both are valid.

Rules while mixing: never `await` inside `Effect.gen` (use `Effect.promise` /
`tryPromise`); never throw from Effect code; never run effects from inside other
effects (`runPromise` nested) except through `ManagedRuntime` at a true edge.

## Effect v3 to v4 rename map

Apply mechanically before anything else. Compile errors guide the rest.

### Packages and imports
| v3 | v4 |
|---|---|
| `@effect/platform/Http*`, `HttpApi*` | `effect/unstable/http/*`, `effect/unstable/httpapi/*` |
| `@effect/platform/{FileSystem,Path,Terminal}` | `effect/{FileSystem,Path,Terminal}` (core) |
| `@effect/platform/Command`, `CommandExecutor` | `effect/unstable/process/ChildProcess`, `ChildProcessSpawner` |
| `@effect/platform/KeyValueStore` | `effect/unstable/persistence/KeyValueStore` |
| `@effect/cli/{Args,Options,Command}` | `effect/unstable/cli/{Argument,Flag,Command}` |
| `@effect/sql/*`, `@effect/rpc/*`, `@effect/cluster/*`, `@effect/workflow/*`, `@effect/ai/*` | `effect/unstable/{sql,rpc,cluster,workflow,ai}/*` |
| `@effect/schema` | `effect/Schema` (rewritten; see below) |
| `effect/Either` | `effect/Result` (`Either.right`→`Result.succeed`, `Either.left`→`Result.fail`, `Effect.either`→`Effect.result`) |
| `effect/JSONSchema` | `effect/JsonSchema` |
| `effect/T{Ref,Map,Set,Queue,PubSub,Semaphore,Deferred,PriorityQueue,ReentrantLock,SubscriptionRef}` | `effect/Tx{Ref,HashMap,HashSet,Queue,PubSub,Semaphore,Deferred,PriorityQueue,ReentrantLock,SubscriptionRef}` |
| `Mailbox` | `Queue` (Queue now carries end/fail signalling) |
| `@effect/platform-bun` | unchanged; same version as `effect` |

### Services and context
| v3 | v4 |
|---|---|
| `class X extends Context.Tag("X")<X, Shape>()` | `class X extends Context.Service<X, Shape>()("X")` (type params first) |
| `Context.GenericTag<I>("X")` | `Context.Service<I>("X")` |
| `Effect.Service<X>()("X", { effect, dependencies })` with `.Default` | `Context.Service<X>()("X", { make })` plus explicit `static layer = Layer.effect(this, this.make).pipe(Layer.provide(...))`; no `dependencies`, no `.Default` |
| `Effect.Tag` static accessors | `X.use((s) => s.method())`, `X.useSync`; prefer `yield* X` |
| `FiberRef.make` / `FiberRef.get` / `Effect.locally` | `Context.Reference("id", { defaultValue })` / `yield* Ref` / `Effect.provideService(eff, Ref, value)` |
| `FiberRef.currentLogLevel`, `currentMinimumLogLevel`, `currentConcurrency`... | `References.CurrentLogLevel`, `References.MinimumLogLevel`, `References.CurrentConcurrency`, `References.CurrentLogAnnotations`, `References.CurrentLogSpans`, `References.Scheduler`, `References.TracerEnabled`, `References.UnhandledLogLevel` |
| `Effect.runtime<R>()` + `Runtime.runFork(rt)` | `Effect.context<R>()` + `Effect.runForkWith(ctx)`; `Runtime<R>` type removed |
| `Layer.scoped` | `Layer.effect` (scope handled automatically) |
| `Layer.tapErrorCause` | `Layer.tapCause` |
| `Scope.extend` | `Scope.provide` |
| `Effect.provide(l)` twice building twice | memoized across nested provides; `Layer.fresh` or `Effect.provide(l, { local: true })` to opt out |

### Effect combinators
| v3 | v4 |
|---|---|
| `Effect.async` | `Effect.callback` |
| `Effect.zipRight` / `zipLeft` | `Effect.andThen` / `Effect.tap` |
| `Effect.catchAll` / `catchAllCause` / `catchAllDefect` | `Effect.catch` / `catchCause` / `catchDefect` |
| `Effect.catchSome` / `catchSomeCause` | `Effect.catchFilter(Filter.fromPredicate(...), h)` / `catchCauseFilter` |
| `Effect.catchSomeDefect`, `forkAll`, `forkWithErrorHandler` | removed |
| `Effect.tapErrorCause` | `Effect.tapCause` |
| `Effect.fork` / `forkDaemon` | `Effect.forkChild` / `forkDetach` (all forks take `{ startImmediately?, uninterruptible? }`) |
| `Effect.makeSemaphore` / `makeLatch` | `Semaphore.make` / `Latch.make` |
| `Effect.gen(this, fn)` | `Effect.gen({ self: this }, fn)` |
| `Effect.fromNullable` / `Option.fromNullable` | `Effect.fromNullishOr` / `Option.fromNullishOr` |
| `yield* ref`, `yield* deferred`, `yield* fiber`, `yield* option`, `yield* either` | `Ref.get(ref)`, `Deferred.await(d)`, `Fiber.join(f)`, `Effect.fromOption(o)`, `Effect.fromResult(r)`; only Effects, Config, Service keys and TaggedError instances are yieldable in rc.112 |
| new | `Effect.catchReason`, `catchReasons`, `unwrapReason`, `catchEager`, `Effect.fn.Return<A,E,R>` |

### Cause, Exit, equality
| v3 | v4 |
|---|---|
| `Cause` tree (`Sequential`/`Parallel`) | flat `cause.reasons: Array<Fail | Die | Interrupt>`; `Cause.combine` |
| `Cause.isFailure/isDie/isInterrupted` | `Cause.hasFails/hasDies/hasInterrupts`; per reason `Cause.isFailReason` etc |
| `Cause.failureOption` / `failures` / `defects` | `Cause.findErrorOption`; `reasons.filter(Cause.isFailReason)`; `Cause.findFail/findDie` return `Result` |
| `NoSuchElementException`, `TimeoutException` | `NoSuchElementError`, `TimeoutError` (all `*Exception` → `*Error`) |
| `Equal.equals` reference-based for plain objects | structural by default (objects, arrays, Map, Set, Date, RegExp; NaN equals NaN); `Equal.byReference(obj)` to opt out; `Equal.equivalence`→`Equal.asEquivalence` |

### Stream
`Stream.fromChunk`→`fromArray`, `mapChunks`→`mapArray`, `Stream.either`→`result`,
`catchAll`→`catch`, `catchAllCause`→`catchCause`, `repeatEffect`→`fromEffectRepeat`,
`Stream.async`→`callback`, `Chunk` mostly replaced by arrays.

### Schema (largest change; see schema reference)
| v3 | v4 |
|---|---|
| `Schema.Union(A, B)` | `Schema.Union([A, B])` |
| `Schema.Literal("a", "b")` | `Schema.Literals(["a", "b"])` (`Literal` takes one) |
| `Schema.Record({ key, value })` | `Schema.Record(key, value)` |
| `Schema.Struct({ a: Schema.optional(X) })` | `Schema.optionalKey(X)` (key may be absent) or `Schema.optional(X)` (absent or undefined) |
| `.pipe(Schema.filter(pred))`, `Schema.int()`, `positive()`, `pattern(re)`, `minLength(n)` | `.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isPattern(re), Schema.isMinLength(n))`; custom: `Schema.check(Schema.makeFilter(pred, { message }))` |
| `Schema.transform(from, to, { decode, encode })` | `from.pipe(Schema.decodeTo(to, SchemaTransformation.transform({ decode, encode })))` or `SchemaGetter` |
| `Schema.decodeUnknown(S)` (effect) / `decodeUnknownSync` / `validate*` | `Schema.decodeUnknownEffect(S)` / `decodeUnknownSync` / `decodeUnknownOption` / `decodeUnknownResult`; validate removed (use `Schema.is`, `Schema.asserts(S, input)`) |
| `Schema.annotations({...})` | `.annotate({...})` |
| `Schema.DateFromSelf` etc | `Schema.Date` (all `*FromSelf` drop suffix); `Schema.DateTimeUtcFromString` |
| `Schema.TaggedError<E>()("Tag", fields)` | same shape; third arg annotations e.g. `{ httpApiStatus: 404 }`; `Schema.Error` for untagged |
| `Schema.Class<A>("Id")({...})` | same; construct with `new A({...})`, `A.make`, `A.makeEffect` |
| `Schema.Schema.Type<typeof S>` | `typeof S.Type`, `typeof S.Encoded` |
| `Schema.parseJson(S)` | `Schema.fromJsonString(S)` |
| `Schema.Redacted(S)` | expects `Redacted` values; `Schema.RedactedFromValue` for old behaviour |
| `Schema.asSchema` / `typeSchema` / `encodedSchema` | `revealCodec` / `toType` / `toEncoded` |
| `Schema.equivalence/arbitrary/pretty/standardSchemaV1` | `toEquivalence/toArbitrary/toFormatter/toStandardSchemaV1` |
| `ParseResult.ParseError` | `Schema.SchemaError` with `.issue` (`SchemaIssue`); format with `SchemaIssue.makeFormatterDefault()` |

### CLI
`Options.*`→`Flag.*`, `Args.*`→`Argument.*`, `Command.make(name, config, handler)` unchanged,
`Command.run(cmd, { name, version })`→`Command.run({ version })` (name from `make`),
`Options.withSchema`→`Flag.withSchema`, parent flags via `Command.withSharedFlags` and `yield* parentCommand`.

### HTTP
`HttpApiEndpoint.get("name")\`/path\`.setPayload(S).addSuccess(S).addError(E)` →
`HttpApiEndpoint.get("name", "/path", { params, query, payload, headers, success, error })`;
`HttpApiBuilder.api` → `HttpApiBuilder.layer(Api, { openapiPath })`;
`HttpApiBuilder.serve` → `HttpRouter.serve(routes)`; `HttpApiBuilder.middlewareCors` → `HttpRouter.cors`;
`HttpApiMiddleware.Tag` → `HttpApiMiddleware.Service`; `HttpApiSchema.annotations({ status })` → `{ httpApiStatus }` on the error class or `HttpApiSchema.status(404)`.

## Migration procedure (v3 project)

1. Bump every `effect` and `@effect/*` dependency to the same `4.0.0-rc.N`.
   Remove packages that merged into `effect`.
2. Run `bunx tsc --noEmit`; fix imports first (table above), then services, then
   Schema, then combinators. Expect Schema to be most of the work.
3. Replace `Effect.Service` classes: keep the class, change to `Context.Service`,
   move `dependencies` into `static layer = Layer.effect(this, make).pipe(Layer.provide(...))`,
   rename `.Default` usages to `.layer`.
4. Search for `yield*` on `Ref`, `Deferred`, `Fiber` values and wrap them.
5. Re-run tests; `TestClock` moved to `effect/testing`; `@effect/vitest` at the
   same rc if used.
