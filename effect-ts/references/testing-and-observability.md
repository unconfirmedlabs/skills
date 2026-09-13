# Testing and observability

Requires: [core](core.md), [services](services.md). Snippets with domain names
are API sketches; use [source and coverage](source-and-coverage.md) for exact APIs.

## Tests with `bun test`

Everything under `effect/testing` is plain layers, so `bun:test` needs no adapter.

```ts
import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer, Ref } from "effect"
import { TestClock, TestConsole } from "effect/testing"

const TestLayer = Layer.mergeAll(TodoService.layerTest, TestClock.layer(), TestConsole.layer)

const run = <A, E>(effect: Effect.Effect<A, E, TodoService | TestClock.TestClock | TestConsole.TestConsole>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer, { local: true })))

test("adds a todo", async () => {
  const count = await run(Effect.gen(function*() {
    const svc = yield* TodoService
    return yield* svc.addAndCount("write docs")
  }))
  expect(count).toBe(1)
})

test("fails with a typed error", async () => {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLayer)))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    expect(Cause.squash(exit.cause)).toBeInstanceOf(TodoNotFound)
  }
})

test("or use Effect.flip to assert on the error channel", async () => {
  const error = await run(svc.getById(99).pipe(Effect.flip))
  expect(error._tag).toBe("TodoNotFound")
})
```

- `Effect.provide(layer, { local: true })` builds a fresh memo map per call, so
  stateful test layers (`Ref`-backed repos) do not leak between tests.
- Test layers: same `Context.Service` key, alternative implementation, exposed as
  `static layerTest`. Back state with a `Ref` service (`TodoRepoTestRef`) and
  `Layer.provideMerge` it so tests can inspect the underlying state.
- `Layer.mock(Users, { get: () => Effect.succeed(user) })` fills the rest of the
  interface with methods that die with "unimplemented", handy for narrow tests.

### Time, console, config, schema

```ts
// TestClock: fork, adjust, then join. Sleep/Schedule/timeout all use the Clock.
const fiber = yield* Effect.forkChild(Effect.sleep("5 minutes").pipe(Effect.timeout("1 minute")))
yield* TestClock.adjust("1 minute")
const exit = yield* Fiber.await(fiber)
// TestClock.setTime(ms), TestClock.withLive(effect) escape to the real clock.

// TestConsole captures Console.log / Console.error
yield* Console.log("hi")
expect(yield* TestConsole.logLines).toEqual(["hi"])

// Config: never read real env in tests
const TestConfig = ConfigProvider.layer(ConfigProvider.fromUnknown({ PORT: 4000, DB: { URL: "x" } }))
// or ConfigProvider.fromEnvRecord({ PORT: "4000" }); ConfigProvider.layerAdd(...) composes with the current provider

// Schema: decoding/encoding/round-trip assertions
const asserts = new TestSchema.Asserts(Schema.NumberFromString)
await asserts.decoding().succeed("42", 42)
await asserts.decoding().fail(null, "Expected string")
await asserts.verifyLosslessTransformation({ params: { numRuns: 50 } })
```

`DateTime.now`, sleep and schedules use Clock. Random uses its own configurable
random service; TestClock alone does not seed it. Inject the appropriate services
for reproducible behavior.

### HttpApi and RPC without a socket

```ts
const makeClient = HttpApiTest.groups(Api, ["users"])           // typed in-memory client
const client = yield* makeClient                                 // needs handlers + HttpServer.layerServices
const error = yield* client.users.getById({ params: { id } }).pipe(Effect.flip)
```

Provide `Layer.mergeAll(HandlersLayer, HttpServer.layerServices)` plus any
client-side middleware layer (`HttpApiMiddleware.layerClient(Authorization, ...)`).
`RpcTest.makeClient(group)` does the same for RPC groups.

### If the project uses vitest

`@effect/vitest` (same rc version) provides `it.effect` (TestClock + TestConsole
provided), `it.live` (real services), `it.scoped`, `it.effect.prop(name, [Schema], fn)`,
and `layer(L)("name", (it) => ...)` for one shared layer per block.

## Logging

```ts
yield* Effect.logInfo("checkout completed", { orderId })     // structured payload
yield* Effect.logDebug / logWarning / logError / logFatal
program.pipe(Effect.annotateLogs({ service: "api", route }), Effect.withLogSpan("checkout"))

Logger.layer([Logger.consoleJson])                  // one JSON object per line (production)
Logger.layer([Logger.consolePretty()])              // default dev output
Logger.layer([Logger.consoleLogFmt])                // key=value
Logger.layer([Logger.toFile(Logger.formatSimple, "app.log")]).pipe(Layer.provide(BunServices.layer))
Layer.succeed(References.MinimumLogLevel, "Warn")   // filter
Logger.layer([...], { mergeWithExisting: true })    // add instead of replace
Logger.batched(Logger.formatStructured, { window: "1 second", flush: Effect.fn(function*(batch) {...}) })
```

Pick the logger by environment with `Layer.unwrap(Effect.gen(...))` reading `Config`.
Errors logged through `Effect.logError(error)` print the tagged error's fields.

## Tracing and metrics

```ts
Effect.fn("Users.getById")(...)                 // span per call, named after the function
effect.pipe(Effect.withSpan("checkout.charge", { attributes: { orderId } }))
yield* Effect.annotateCurrentSpan({ userId })
effect.pipe(Effect.annotateSpans({ "checkout.provider": "acme" }))
SomeLayer.pipe(Layer.withSpan("startup"))

const requests = Metric.counter("api_requests_total", { description: "..." })
yield* Metric.update(requests, 1)
Metric.gauge(name) / Metric.histogram(name, { boundaries: Metric.exponentialBoundaries({...}) }) / Metric.timer(name) / Metric.frequency(name)
metric.pipe(Metric.withAttributes({ route }))
```

Spans propagate through fibers, `Effect.forEach`, layers, HTTP clients (trace
headers on by default) and servers.

### Exporters

```ts
import { FetchHttpClient } from "effect/unstable/http"
import { Otlp, OtlpLogger, OtlpMetrics, OtlpSerialization, OtlpTracer, PrometheusMetrics } from "effect/unstable/observability"

// everything to one OTLP collector
const Observability = Otlp.layerJson({
  baseUrl: "http://localhost:4318",
  resource: { serviceName: "api", serviceVersion: "1.0.0", attributes: { "deployment.environment": "prod" } }
}).pipe(Layer.provide(FetchHttpClient.layer))

// or per signal: OtlpTracer.layer({ url: ".../v1/traces", resource }), OtlpLogger.layer({ url: ".../v1/logs" }),
// OtlpMetrics.layer({ url: ".../v1/metrics", temporality: "delta" }) — each needs OtlpSerialization.layerJson + an HttpClient
// Otlp.layerFromConfig() reads OTEL_* env vars.

// Prometheus scrape endpoint on the app's HttpRouter
PrometheusMetrics.layerHttp({ path: "/metrics", prefix: "myapp" })

// local devtools (VS Code Effect extension) over ws://localhost:34437
DevTools.layer()
```

Provide the observability layer last (outermost), so every span the app creates
is exported: `AppLayer.pipe(Layer.provide(Observability))`. Use
`@effect/opentelemetry` `NodeSdk` only when integrating with an existing OTel SDK.

## Checklist before "done"

- `bunx tsc --noEmit` clean, including language-service diagnostics if patched.
- `bun test` green; each test provides its own layers; no real env, clock, or network.
- Useful operation spans and bounded telemetry; untraced helpers remain valid.
- Verify expected failures, defects and interruption as distinct Exit/Cause cases.

## Properties, laws and behavioral evidence

Use Schema-generated arbitraries/fast-check for codec laws, pure transitions and
collection invariants. `effect/unstable/arbitrary/Arbitrary` also supplies schema
generation, `checkEffect`, `sampleEffect`, shrinking and replay tokens. A generated
input property needs its own stateful fixture: `checkEffect` does not reset
mutable services between cases. Capture seed/replay on failure.

For resource/concurrency tests, use Deferred/barriers plus TestClock where time
matters. Assert cancellation is interruption, acquisition has one matching release,
critical child errors reach an owner, and retries do not duplicate mutations.
Use type tests for success/error/requirements and rejected misuse. Do not count
a compiler pass as runtime validation or a fake's success as backend equivalence.

`TestClock`, `TestConsole`, `TestSchema` and other testing modules are discoverable
through the inventory. @effect/vitest is an optional runner integration; preserve
the project's existing runner when plain Effect test services suffice.

## Telemetry lifetime and cardinality

Logger, Tracer and Metric describe in-process instrumentation; OTLP/Prometheus and
OpenTelemetry adapters export it. Provide exporter dependencies and scope so
shutdown flushes bounded batches. Worker isolates cannot guarantee a background
exporter's process-style shutdown; use the invocation's owned background work or
platform telemetry integration. Logs/spans must not contain raw secrets, unbounded
request bodies or sensitive Schema.Defect payloads.

Choose low-cardinality metric labels (route template/status category, not user id
or raw URL). Named Effect.fn is a useful operation boundary; prefer fnUntraced for
helpers where a span adds noise. ErrorReporter can integrate unexpected failures
with external reporting; avoid duplicate reporting and preserve interruption as a
different termination cause. Devtools belongs to development unless explicitly
configured for another supported environment.
