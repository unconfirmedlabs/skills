# Testing and observability

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

`DateTime.now`, `Random.next`, `Effect.sleep`, `Schedule` all honour the test
services, which is why production code must go through them.

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
- Every service method has a span (`Effect.fn("Service.method")`).
- Errors surface as tagged errors in `Exit`, not thrown strings.
