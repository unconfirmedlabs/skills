# Resilience: retries, timeouts, fallbacks, rate limits, caching

## Schedules

A `Schedule<Output, Input, Error, Env>` decides whether and when to recur.

```ts
Schedule.recurs(5)                          // n additional times
Schedule.spaced("1 second")                 // fixed gap after each run
Schedule.fixed("1 second")                  // fixed interval regardless of run time
Schedule.exponential("100 millis", 2)       // base * factor^n
Schedule.fibonacci("100 millis"); Schedule.forever; Schedule.once; Schedule.cron("*/5 * * * *"); Schedule.during("1 minute")
schedule.pipe(Schedule.jittered)            // randomize delays
Schedule.max([Schedule.exponential("250 millis"), Schedule.recurs(6)])   // continue while ALL continue, slowest delay = backoff with attempt cap
Schedule.min([Schedule.exponential("250 millis"), Schedule.spaced("10 seconds")])  // fastest delay = backoff capped at 10s
Schedule.concat(a, b)                       // a to exhaustion, then b
schedule.pipe(Schedule.setInputType<HttpError>(), Schedule.while(({ input, attempt, elapsed }) => input.retryable && attempt < 10))
schedule.pipe(Schedule.tap((meta) => Effect.logDebug("retrying", { attempt: meta.attempt, in: Duration.toMillis(meta.duration) })))
Schedule.addDelay((meta) => Effect.succeed("1 second")) / modifyDelay((meta) => Effect.succeed(meta.duration)) / upTo({ duration: "1 minute", times: 20 }) / passthrough
```

No `Schedule.until`, `andThen`, `both`, `either`, `tapInput` in v4.
`Schedule.CurrentMetadata` reference exposes `{ attempt, elapsed, input, output }`.

## Retry and repeat

```ts
effect.pipe(Effect.retry({ times: 3 }))
effect.pipe(Effect.retry({ schedule: Schedule.exponential("200 millis"), times: 5, while: (e) => e._tag === "Transient" }))
effect.pipe(Effect.retry(policy))
effect.pipe(Effect.retry(($) => $(Schedule.spaced("1 second")).pipe(Schedule.while(({ input }) => input.retryable))))  // infers E
effect.pipe(Effect.retryOrElse(policy, (lastError) => fallback))
effect.pipe(Effect.repeat({ schedule: Schedule.spaced("30 seconds"), until: (a) => a.done }))
Effect.schedule(effect, schedule)          // repeat without the initial run's value
```

The effect always runs once before the schedule is consulted. Production
default for network calls:

```ts
const transient = Schedule.min([Schedule.exponential("250 millis"), Schedule.spaced("10 seconds")]).pipe(Schedule.jittered)
call.pipe(Effect.retry({ schedule: Schedule.max([transient, Schedule.recurs(5)]), while: isRetryable }), Effect.timeout("30 seconds"))
```

HTTP clients have this built in: `HttpClient.retryTransient({ schedule, times })`.

## Timeouts and fallbacks

```ts
Effect.timeout(effect, "5 seconds")                         // E | Cause.TimeoutError
Effect.timeoutOption(effect, "5 seconds")                   // Option<A>
Effect.timeoutOrElse(effect, { duration: "5 seconds", orElse: () => fallback })
Effect.race(primary, secondary)                             // first success; losers interrupted
Effect.raceAll([a, b, c]); Effect.raceFirst(a, b)           // first completion
Effect.catchTag("TimeoutError", () => cached)
Effect.orElseSucceed(() => defaultValue)
Effect.firstSuccessOf([primary, secondary])              // sequential fallback chain
```

Always pass the `AbortSignal` from `Effect.tryPromise((signal) => ...)` so a
timeout cancels the underlying request.

## Execution plans (ordered fallbacks across providers or configs)

```ts
const plan = ExecutionPlan.make(
  { provide: OpenAiLanguageModel.model("gpt-5.2"), attempts: 3, schedule: Schedule.exponential("500 millis") },
  { provide: AnthropicLanguageModel.model("claude-opus-4-6"), attempts: 2, while: (e) => e._tag !== "Fatal" }
)
effect.pipe(Effect.withExecutionPlan(plan, { onEvent: (ev) => Effect.log(ev._tag, { step: ev.stepIndex }) }))
const planLayer = yield* plan.captureRequirements    // move step requirements into a Layer's R
```

Each step provides a `Layer` or `Context`, retries `attempts` times with its
`schedule`, then falls through. Events: `AttemptStart | AttemptSuccess | AttemptFailure`.
Use for LLM provider fallback, primary/replica databases, regional endpoints.

## Rate limiting and concurrency limits

```ts
const sem = yield* Semaphore.make(8); Semaphore.withPermits(sem, 1)(call)                     // in-process concurrency cap
Effect.forEach(items, f, { concurrency: 8 }); Stream.mapEffect(f, { concurrency: 8 })
Stream.throttle({ cost: () => 1, units: 10, duration: "1 second", strategy: "shape" })      // stream rate
// shared limiter across requests/processes (effect/unstable/persistence)
const withRateLimiter = yield* RateLimiter.makeWithRateLimiter          // needs RateLimiter.layer + layerStoreMemory | layerStoreRedis
call.pipe(withRateLimiter({ key: `user:${id}`, limit: 100, window: "1 minute", algorithm: "token-bucket", onExceeded: "delay" | "fail" }))   // fail -> RateLimiterError
HttpClient.withRateLimiter(client, { limiter, window: "1 minute", limit: 100 })   // also retries 429s through the limiter
```

## Caching and memoization

```ts
const cached = yield* Effect.cached(expensive)                  // Effect<Effect<A>>: first run memoized forever
const cached = yield* Effect.cachedWithTTL(expensive, "1 hour")
const { get, invalidate } = yield* Effect.cachedInvalidateWithTTL(expensive, "1 hour")

const cache = yield* Cache.make<Key, A, E>({ capacity: 1000, timeToLive: "10 minutes", lookup: (key) => fetch(key) })
yield* Cache.get(cache, key)            // concurrent misses share one lookup; failures cached until TTL
yield* Cache.invalidate(cache, key); Cache.refresh; Cache.set; Cache.getOption; Cache.invalidateAll
Cache.makeWith(lookup, { capacity, timeToLive: (exit, key) => Exit.isSuccess(exit) ? "1 hour" : "30 seconds" })
ScopedCache.make(...)                   // entries own resources released on eviction
RequestResolver + Request.Class         // batching + dedup of concurrent lookups (see services reference)
PersistedCache (effect/unstable/persistence)   // Schema-keyed cache backed by KeyValueStore/Redis/SQL
```

## Circuit breaking and health

No built-in circuit breaker in v4 core. Compose one: a `Ref<{ state, openedAt }>`
checked before the call, `Effect.tapError` to count failures, `Effect.fail(new
CircuitOpen())` while open, and a `Schedule` for the half-open probe. Expose it
as a service so tests can drive it with `TestClock`.

## Checklist

- Every external call: typed error, timeout, retry policy for transient errors only, span.
- Never retry non-idempotent writes without an idempotency key.
- Bound concurrency on fan-out; bound queues; bound caches (`capacity`).
- Prefer `Schedule.jittered`; cap total time with `Schedule.upTo({ duration })` or an outer timeout.
- Make time observable: `TestClock.adjust` must be able to drive every schedule you write.
