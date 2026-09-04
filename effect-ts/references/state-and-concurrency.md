# State, fibers, coordination, state machines

## Fibers

```ts
const fiber = yield* Effect.forkChild(work)          // child of current fiber (was Effect.fork)
const fiber = yield* Effect.forkScoped(work)         // interrupted when the enclosing Scope closes (layers, Effect.scoped)
const fiber = yield* Effect.forkIn(work, scope)      // explicit scope
const fiber = yield* Effect.forkDetach(work)         // outlives the parent (was forkDaemon)
// options: { startImmediately?: boolean, uninterruptible?: boolean | "inherit" }
yield* Fiber.join(fiber)          // propagates failure
yield* Fiber.await(fiber)         // Exit
yield* Fiber.interrupt(fiber)     // waits for finalizers
yield* Fiber.joinAll([...]) / Fiber.awaitAll([...]) / Fiber.interruptAll([...])
yield* Effect.awaitAllChildren(effect)
```

Structured concurrency: `Effect.all` / `forEach({ concurrency })` / `race` /
`raceAll` / `raceFirst` interrupt losers and siblings on failure. Long-lived
background work belongs in a layer:

```ts
const Worker = Layer.effectDiscard(Effect.forkScoped(loop).pipe(Effect.asVoid))
```

Track dynamic fibers with `FiberSet.make()` (unordered), `FiberMap.make<K>()`
(keyed; `run(map, key, effect)` replaces the previous), `FiberHandle.make()`
(single slot). All are scoped; `FiberSet.runtime(set)` gives a function to fork
from non-Effect callbacks.

Interruption: `Effect.interrupt`, `Effect.onInterrupt(effect, cleanup)`,
`Effect.uninterruptible`, `Effect.uninterruptibleMask((restore) => ...)`,
`Effect.abortSignal` (scope-managed `AbortSignal`), `Effect.timeout`.

## Coordination primitives

| Need | Use |
|---|---|
| Shared mutable value, pure updates | `Ref.make(a)`; `Ref.get/set/update/modify/getAndUpdate` (atomic CAS) |
| Effectful update, serialized | `SynchronizedRef` with `modifyEffect/updateEffect` |
| Observable value | `SubscriptionRef`; `SubscriptionRef.changes(ref)` is a Stream (current value first) |
| Hot-swappable resource | `ScopedRef.fromAcquire(acquire)`; `ScopedRef.set(ref, acquireNext)` releases the old |
| One-shot signal | `Deferred.make<A, E>()`; `Deferred.succeed/fail/await/poll/complete(effect)` |
| Gate | `Latch.make(open)`; `latch.await`, `Latch.open/close/release` |
| Limit concurrency | `Semaphore.make(n)`; `Semaphore.withPermits(sem, k)(effect)`, `withPermitsIfAvailable`, `resize`; `PartitionedSemaphore` per key |
| Work queue | `Queue.bounded<A, Cause.Done>(n)` / `unbounded` / `sliding` / `dropping`; `offer/offerAll/take/takeAll/takeN/takeBetween/poll`; `Queue.end` (needs `Cause.Done` in E), `Queue.fail(e)`, `Queue.shutdown`; `Stream.fromQueue(q)` |
| Fan-out events | `PubSub.bounded<A>({ capacity, replay })`; `publish/publishAll`; `Stream.fromPubSub(ps)`; `PubSub.subscribe` (scoped) |
| Atomic multi-value transactions | `TxRef`, `TxQueue`, `TxHashMap`, `TxSemaphore`, `TxReentrantLock` inside `Effect.tx(...)`; `Effect.txRetry` blocks until a read value changes |

`Queue` in v4 replaces `Mailbox`: it carries completion. Declare the error
channel as `Queue.bounded<A, Cause.Done>(n)` when producers will call
`Queue.end`; a consumer loop `while (true) { const a = yield* Queue.take(q) }`
then ends when `take` fails with `Cause.Done`. `Stream.fromQueue` strips `Done`. `Queue.into(q)(effect)` pipes an effect's
exit into the queue.

Transactions:

```ts
const from = yield* TxRef.make(100); const to = yield* TxRef.make(0)
yield* Effect.tx(Effect.gen(function*() {
  const bal = yield* TxRef.get(from)
  if (bal < 50) return yield* Effect.txRetry            // wait for a deposit, then re-run
  yield* TxRef.update(from, (n) => n - 50)
  yield* TxRef.update(to, (n) => n + 50)
}))
// nested Effect.tx joins the outer transaction; commit happens once, all-or-nothing
```

Effect.atomic / STM module / `Effect.withConcurrency` do not exist in v4;
`concurrency` is `number | "unbounded"`.

## State machines (the agent-workflow pattern)

Goal: every state change is a typed, validated, observable transition; no
partial states; replayable from events. Full runnable example in
`assets/templates/state-machine.ts`.

1. **States and events as schemas.** `Schema.TaggedStruct("Running", {...})`,
   `Schema.Union([...]).pipe(Schema.toTaggedUnion("_tag"))`. Now `State.match(s, {...})`
   is exhaustive, `State.guards.Running(u)`, `Event.make(...)` validates, and both
   decode from JSON (CLI stdin, queue, DB, LLM output).
2. **Pure transition** `(state, event) => State | InvalidTransition`. No effects
   inside. Test it as a table.
3. **One writer.** A `Context.Service` owning a `SubscriptionRef<State>`
   (or `TxRef` when several refs must change together). `dispatch(event)` uses
   `SubscriptionRef.modifyEffect(ref, (s) => result instanceof InvalidTransition ? Effect.fail(result) : Effect.succeed([next, next]))`
   so invalid transitions fail without touching state, then logs `{ from, event, to }`.
4. **Effects on transition** run after the state is committed and are
   themselves Effects with typed errors; if they fail, dispatch a failure event
   rather than mutating state ad hoc.
5. **Observe** with `SubscriptionRef.changes(ref)` (Stream) for UIs, logs,
   metrics; **persist** the state document with `KeyValueStore.toSchemaStore`
   or SQL after each transition when the process may restart.
6. **Expose** transitions as CLI subcommands (`agent start`, `agent step`,
   `agent status --json`) or RPC methods; each command decodes an event, calls
   `dispatch`, and prints the new state. Exit non-zero on `InvalidTransition`.
7. **Durable, multi-step, restart-safe** flows: use `Workflow` + `Activity`
   (data-and-workflows reference); the workflow definition is the machine, each
   activity is an idempotent step, and the engine journals progress.

Long-running loops: keep the loop in a `forkScoped` fiber inside a layer, read
events from a `Queue`, and dispatch; shutdown is interruption plus finalizers.

## Scope and resources

```ts
const conn = yield* Effect.acquireRelease(open(), (c, exit) => close(c))   // needs Scope
yield* Effect.addFinalizer((exit) => cleanup)
Effect.scoped(effect)                     // provide and close a Scope around effect
Effect.acquireUseRelease(acquire, use, release)
const scope = yield* Scope.make(); Scope.provide(effect, scope); Scope.close(scope, Exit.void); Scope.fork(scope)
Effect.ensuring(effect, finalizer); Effect.onExit(effect, (exit) => ...); Effect.onError(...)
```

Layers own scopes: resources acquired in `Layer.effect` live until the layer
is torn down (`Layer.launch` or runtime dispose). `fs.open`, `spawner.spawn`,
`PubSub.subscribe`, `makeTempDirectoryScoped` all require a Scope.
