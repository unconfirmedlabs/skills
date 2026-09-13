import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Schedule from "effect/Schedule"
import * as TestClock from "effect/testing/TestClock"
import * as TxRef from "effect/TxRef"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import { getUser, layerMemory, User, UserNotFound, UserRepo } from "../templates/library.js"
import { makeClient } from "../templates/host-bridge.js"

describe("skill correctness examples", () => {
  test("Context service identity follows its string key", () => {
    const first = Context.Service<string>("test/shared-key")
    const second = Context.Service<string>("test/shared-key")
    expect(Context.get(Context.make(first, "same slot"), second)).toBe("same slot")
  })

  test("cached tuple shares values until explicitly invalidated", async () => {
    let calls = 0
    const values = await Effect.runPromise(Effect.gen(function*() {
      const [get, invalidate] = yield* Effect.cachedInvalidateWithTTL(
        Effect.sync(() => ++calls), "1 hour"
      )
      const first = yield* get
      const cached = yield* get
      yield* invalidate
      return [first, cached, yield* get]
    }))
    expect(values).toEqual([1, 1, 2])
  })

  test("bounded retries use controlled time and the documented attempt count", async () => {
    let attempts = 0
    await Effect.runPromise(Effect.gen(function*() {
      const call = Effect.suspend(() => ++attempts < 3 ? Effect.fail("transient") : Effect.succeed("ok"))
      const fiber = yield* Effect.forkChild(call.pipe(
        Effect.retry({ times: 2, schedule: Schedule.spaced("1 second") })
      ))
      yield* TestClock.adjust("2 seconds")
      expect(yield* Fiber.join(fiber)).toBe("ok")
      expect(attempts).toBe(3)
    }).pipe(Effect.provide(TestClock.layer())))
  })

  test("string-only KV encodes bytes and returns the same bytes", async () => {
    const values = new Map<string, string>()
    const kv = KeyValueStore.makeStringOnly({
      get: key => Effect.sync(() => values.get(key)),
      set: (key, value) => Effect.sync(() => { values.set(key, value) }),
      remove: key => Effect.sync(() => { values.delete(key) }),
      clear: Effect.sync(() => values.clear()),
      size: Effect.sync(() => values.size)
    })
    const bytes = new Uint8Array([0, 1, 254, 255])
    await Effect.runPromise(kv.set("bytes", bytes))
    expect(values.get("bytes")).toBe("AAH+/w==")
    expect(await Effect.runPromise(kv.getUint8Array("bytes"))).toEqual(bytes)
  })

  test("transaction failure rolls back transactional state", async () => {
    await Effect.runPromise(Effect.gen(function*() {
      const ref = yield* TxRef.make(10)
      const exit = yield* Effect.exit(Effect.tx(Effect.gen(function*() {
        yield* TxRef.set(ref, 99)
        return yield* Effect.fail("rollback")
      })))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* TxRef.get(ref)).toBe(10)
    }))
  })

  test("transaction retry reexecutes ordinary effects in the body", async () => {
    await Effect.runPromise(Effect.gen(function*() {
      const ready = yield* Deferred.make<void>()
      const ref = yield* TxRef.make(0)
      let executions = 0
      const updater = yield* Effect.forkChild(
        Deferred.await(ready).pipe(Effect.andThen(TxRef.set(ref, 1)))
      )
      yield* Effect.tx(Effect.gen(function*() {
        // Deliberately non-transactional: demonstrates why this is unsafe in app code.
        executions++
        if ((yield* TxRef.get(ref)) === 0) {
          yield* Deferred.succeed(ready, undefined)
          return yield* Effect.txRetry
        }
      }))
      yield* Fiber.join(updater)
      expect(executions).toBe(2)
    }))
  })

  test("interruption aborts a supported Promise and releases its scope", async () => {
    let aborted = false, releases = 0
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    await Effect.runPromise(Effect.gen(function*() {
      const work = Effect.gen(function*() {
        yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { releases++ }))
        return yield* Effect.tryPromise({
          try: signal => new Promise<void>((_resolve, reject) => {
            const abort = () => { aborted = true; reject(new Error("aborted")) }
            if (signal.aborted) abort()
            else signal.addEventListener("abort", abort, { once: true })
            markStarted()
          }),
          catch: cause => cause
        })
      }).pipe(Effect.scoped)
      const fiber = yield* Effect.forkChild(work)
      yield* Effect.promise(() => started)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
    }))
    expect(aborted).toBe(true)
    expect(releases).toBe(1)
  })

  test("explicit JSON codecs round-trip bigint and bytes", async () => {
    const codec = Schema.toCodecJson(Schema.Struct({ amount: Schema.BigInt, bytes: Schema.Uint8Array }))
    const value = { amount: 9007199254740993n, bytes: new Uint8Array([0, 255]) }
    const encoded = await Effect.runPromise(Schema.encodeEffect(codec)(value))
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(codec)(JSON.parse(JSON.stringify(encoded))))
    expect(decoded).toEqual(value)
  })

  test("library and Promise bridge preserve value and tagged failure", async () => {
    const user = new User({ id: "1", name: "Ada" })
    const layer = layerMemory([user])
    expect(await Effect.runPromise(getUser("1").pipe(Effect.provide(layer)))).toEqual(user)
    const missing = await Effect.runPromise(getUser("missing").pipe(Effect.flip, Effect.provide(layer)))
    expect(missing).toBeInstanceOf(UserNotFound)
    const client = makeClient([user])
    try {
      expect(await client.getUser("1")).toEqual(user)
      await expect(client.getUser("missing")).rejects.toBeInstanceOf(UserNotFound)
    } finally {
      await client.dispose()
    }
  })

  test("Effect Stream response retains scope until body cancellation", async () => {
    let released = false
    const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
      yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { released = true }))
      return HttpServerResponse.stream(Stream.concat(
        Stream.fromEffect(Effect.sync(() => new TextEncoder().encode(released ? "closed" : "open"))),
        Stream.never
      ))
    }))
    const response = await handler(new Request("https://example.test"))
    expect(released).toBe(false)
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("open")
    await reader.cancel()
    expect(released).toBe(true)
  })

  test("raw Response does not transfer an Effect request scope", async () => {
    let released = false
    const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
      yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { released = true }))
      return HttpServerResponse.raw(new Response("native-owned body"))
    }))
    const response = await handler(new Request("https://example.test"))
    expect(released).toBe(true)
    expect(await response.text()).toBe("native-owned body")
  })
})

// Consumer compile-time contract: both requirement and error remain visible.
const typed: Effect.Effect<User, UserNotFound, UserRepo> = getUser("1")
// @ts-expect-error Missing UserRepo cannot be erased.
const missingRequirement: Effect.Effect<User, UserNotFound> = typed
// @ts-expect-error UserNotFound cannot be erased.
const missingError: Effect.Effect<User, never, UserRepo> = typed
const fake: UserRepo["Service"] = { find: () => Effect.succeed(Option.none()) }
void fake
void missingRequirement
void missingError
