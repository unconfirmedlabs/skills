# Core: the Effect type, generators, errors, running

Requires: none. API sketches below need the domain definitions shown as placeholders.
Exact signatures and every exported operation are in [source and coverage](source-and-coverage.md).

`Effect<A, E, R>`: succeeds with `A`, fails with `E` (expected, typed), needs
services `R`. Defects (bugs, `Effect.die`) are not in `E`. Interruption is a
third outcome. `Exit<A, E>` is the materialized result; `Cause<E>` carries
`reasons: Array<Fail<E> | Die | Interrupt>`.

## Writing effects

```ts
import { Effect, Schema } from "effect"

class ParseError extends Schema.TaggedError<ParseError>()("ParseError", { input: Schema.String, cause: Schema.Defect() }) {}

// Effect.gen for blocks; yield* unwraps Effects, Config values, Context.Service keys, and TaggedError instances.
// Option and Result are NOT yieldable in rc.115: lift with Effect.fromOption(o) / Effect.fromResult(r) / Effect.fromNullishOr(x).
const program = Effect.gen(function*() {
  const cfg = yield* Config.String("NAME")
  const users = yield* Users                              // service
  const user = yield* Effect.fromNullishOr(yield* users.find(cfg))   // undefined -> NoSuchElementError
  if (!user.name) return yield* new ParseError({ input: cfg, cause: "empty" })   // always `return yield*` on failure
  return user
})

// Effect.fn for functions: named span + clean stack traces; extra args are pipe steps (never .pipe on the result)
export const parse = Effect.fn("parse")(
  function*(input: string): Effect.fn.Return<Json, ParseError> {
    return yield* Effect.try({ try: () => JSON.parse(input) as Json, catch: (cause) => new ParseError({ input, cause }) })
  },
  Effect.withSpan("parse.extra"),                       // or (effect, input) => effect.pipe(...) to use the args
  Effect.annotateLogs({ op: "parse" })
)
// Effect.fn(body) with no name: no span. Effect.fnUntraced(body): no span, no stack capture (hot paths).
// Effect.fn("Name")({ self: this }, function*(this: Counter, n: number) {...}) binds this.
```

Constructors: `succeed`, `fail`, `die`, `sync` (throws become defects), `promise`
(rejections become defects), `try({ try, catch })`, `tryPromise({ try: (signal) => ..., catch })`,
`callback((resume, signal) => { ...; return cleanupEffect })`, `suspend(() => effect)`,
`fromNullishOr(value)` (fails `NoSuchElementError`), `Effect.void`, `Effect.never`.

Many combinators are dual (verify each overload: `Effect.map(eff, f)` or `eff.pipe(Effect.map(f))`):
`map`, `flatMap`, `andThen(f | effect)`, `tap(f | effect)`, `as(value)`, `asVoid`,
`zip`, `zipWith`, `all([...] | {...}, { concurrency, discard, mode: "default" | "result" })`,
`forEach(items, f, { concurrency, discard })`, `partition` (`[failures, successes]`),
`filterOrFail(pred, () => error)`, `when(effect, condition)`, `whileLoop({ while, body, step })`,
`forever`, `ignore`, `ignoreCause`, `cached`, `cachedWithTTL("1 hour")`,
`cachedInvalidateWithTTL` (returns `[get, invalidate]`), `firstSuccessOf([...])`.
`Effect.if`, `Effect.unless`, `Effect.loop`, `Effect.iterate`, `Effect.orElse`,
`Effect.either`, `Effect.unsandbox` do not exist in v4.

## Errors

Use discriminated errors when callers need selective recovery; retain deliberate upstream typed failures. For example:

```ts
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Schema.String }) {}
class DbError extends Schema.TaggedError<DbError>()("DbError", { cause: Schema.Defect() }) {}
// reason pattern: one public error per service, causes nested as a tagged union
class UsersError extends Schema.TaggedError<UsersError>()("UsersError", { reason: Schema.Union([NotFound, DbError]) }) {}
// Data.TaggedError("Tag")<{ fields }> when no schema is needed; Schema.Error<E>("Tag")({...}) for untagged.
```

`Schema.TaggedError` gives: yieldable (`return yield* new NotFound(...)`), `_tag`,
`message`, JSON encode/decode, use as HTTP/RPC error schema, `{ httpApiStatus }`
annotation. Include `cause: Schema.Defect()` when wrapping unknown failures.

Recover:

```ts
effect.pipe(
  Effect.catchTag("NotFound", (e) => Effect.succeed(null)),
  Effect.catchTag(["NotFound", "DbError"], handler, orElse?),      // several tags
  Effect.catchTags({ NotFound: () => ..., DbError: () => ... }),
  Effect.catchReason("UsersError", "NotFound", (reason, error) => ...),
  Effect.catchReasons("UsersError", { NotFound: ..., DbError: ... }, orElse?),
  Effect.unwrapReason("UsersError"),                               // E becomes NotFound | DbError
  Effect.catchIf((e): e is NotFound => e._tag === "NotFound", h),
  Effect.catchFilter(Filter.tagged("NotFound"), h),
  Effect.catch((e) => ...),                                        // all expected errors (was catchAll)
  Effect.catchCause((cause) => ...),                               // failures + defects + interrupts
  Effect.catchDefect((defect) => ...),
  Effect.mapError((e) => new Wrapped({ reason: e })),
  Effect.orDie,                                                    // E -> defect
  Effect.orElseSucceed(() => fallback),
  Effect.retry({ times: 3 }), Effect.retryOrElse(schedule, (e) => fallback),
  Effect.timeout("5 seconds"),                                     // adds Cause.TimeoutError to E
  Effect.timeoutOption("5 seconds"), Effect.timeoutOrElse({ duration, orElse }),
  Effect.tapError((e) => Effect.logWarning(e)), Effect.tapCause(...),
  Effect.result,   // Effect<Result<A, E>>   Effect.option -> Option<A>   Effect.exit -> Exit<A, E>   Effect.flip
  Effect.sandbox   // E becomes Cause<E>
)
```

Rules: recover where policy is known; map boundary errors when domain semantics change.
Use `orDie` only for a violated invariant or an explicitly fatal policy, never to
hide an inconvenient typed error. `catchCause` includes interruption: re-fail an
interrupted cause unless the boundary deliberately handles cancellation. `Cause.squash(cause)` extracts the most relevant error;
`Cause.pretty(cause)` renders; `Cause.hasFails/hasDies/hasInterrupts`,
`Cause.findErrorOption`. Exit: `Exit.isSuccess/isFailure`, `Exit.match(exit, { onSuccess, onFailure })`.

## Values: Option, Result, Match, Data

```ts
Option.some(1); Option.none(); Option.fromNullishOr(x); Option.getOrElse(o, () => d); Option.getOrUndefined(o)
Option.map / flatMap / filter / match(o, { onNone, onSome }); Option.isSome(o) narrows; yield* Effect.fromOption(o) fails with NoSuchElementError on None
Result.succeed(a); Result.fail(e); Result.isSuccess(r); Result.match(r, { onSuccess, onFailure }); Result.getOrElse; Result.merge
yield* Effect.fromResult(r)   // Failure -> error channel. Neither Option nor Result can be yield*ed directly in rc.115; Effect.result / Effect.option go the other way

// Match: exhaustive dispatch on tagged unions / values
const describe = Match.type<Shape>().pipe(
  Match.tag("Circle", (s) => `r=${s.radius}`),
  Match.tags({ Square: (s) => `side=${s.side}` }),
  Match.exhaustive                     // compile error if a tag is unhandled; Match.orElse(fallback) otherwise
)
Match.value(input).pipe(Match.when({ status: "ok" }, ...), Match.when(Match.string, ...), Match.not(...), Match.orElse(...))
Match.valueTags(state, { Idle: () => ..., Running: (s) => ... })      // one-shot exhaustive by _tag
Match.discriminatorsExhaustive("kind")({ a: ..., b: ... })

// Data: tagged constructors with structural equality
const { Start, Stop, $match, $is } = Data.taggedEnum<Command>()
class Point extends Data.Class<{ x: number; y: number }> {}; class Cmd extends Data.TaggedClass("Cmd")<{ id: string }> {}
Equal.equals(a, b) is structural for plain objects, arrays, Map, Set, Date in v4 (Data.struct does not exist)
```

Prefer `Schema.TaggedStruct` + `Schema.Union([...]).pipe(Schema.toTaggedUnion("_tag"))`
for state and event unions: it gives `.match`, `.matchOrElse`, `.guards`, `.isAnyOf`,
JSON codecs, and construction via `.make`. See the state reference.

## Requirements and services (summary; details in services reference)

```ts
const users = yield* Users                       // yield* a Context.Service to get its implementation
program.pipe(Effect.provide(AppLayer))           // satisfy R with a Layer; Effect.provide([L1, L2]) for several
Effect.provideService(effect, Users, impl)       // one service value
Effect.provideServiceEffect(effect, Users, makeImpl)
const ctx = yield* Effect.context<Users>()       // capture services; Effect.runPromiseWith(ctx)(effect) later
```

## Running

```ts
Effect.runPromise(effect)          // rejects with the squashed cause on failure
Effect.runPromiseExit(effect)      // Promise<Exit<A, E>>; assert on it in tests
Effect.runSync(effect) / runSyncExit   // only for effects that complete synchronously
Effect.runFork(effect, { signal })     // Fiber; Fiber.join / Fiber.interrupt
Effect.runCallback(effect, { onExit })
Effect.runPromiseWith(context)(effect) // run an effect that still needs R
BunRuntime.runMain(effect)             // process entrypoint: signals, exit code, error report
```

Unbound runners require `R = never`; `run*With(context)` satisfies the context
requirements explicitly. Platform `runMain` can supply platform-specific behavior. Only call `run*`
at the program edge, in tests, or inside `ManagedRuntime` bridges.

## Interop

- Promise-based library: `Effect.tryPromise({ try: (signal) => lib.call({ signal }), catch })`.
  Pass the `AbortSignal` so interruption cancels the underlying call.
- Callback API: `Effect.callback` with a cleanup effect returned.
- Async iterable: `Stream.fromAsyncIterable(iter, onError)`.
- Exposing to Promise callers: `ManagedRuntime` or `Effect.runPromise` at the edge.
- `await` inside a generator is a bug; `throw` inside Effect code becomes a defect.

## Time, randomness, clock

`Effect.sleep("1 second")`, `Effect.delay(effect, "500 millis")`, `DateTime.now`
(yieldable; testable via `TestClock`), `Clock.currentTimeMillis`, `Random.next`,
`Random.nextIntBetween(a, b)`, `Random.shuffle`. `Duration` inputs accept
`"5 seconds"`, `5000`, or `Duration.seconds(5)`. Use these services when time/randomness affect testable behavior; use Crypto for
security randomness. Pure date conversion and foreign host APIs remain valid.
