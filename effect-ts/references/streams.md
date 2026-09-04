# Streams and sinks

`Stream<A, E, R>`: pull-based, chunked, backpressured, interruptible sequence.
Use for anything larger than memory, unbounded, or time-based: files, process
output, sockets, SSE, queues, polling, event buses, NDJSON pipelines.

## Create

```ts
Stream.make(1, 2, 3); Stream.fromIterable(xs); Stream.fromArray(arr); Stream.range(1, 10); Stream.empty; Stream.succeed(a); Stream.fail(e)
Stream.fromEffect(eff); Stream.fromEffectRepeat(eff); Stream.fromEffectSchedule(eff, Schedule.spaced("30 seconds"))
Stream.fromQueue(queue); Stream.fromPubSub(pubsub); Stream.fromSchedule(schedule); Stream.tick("1 second")
Stream.paginate(cursor0, (cursor) => Effect<[items, Option<nextCursor>]>)
Stream.unfold(seed, (s) => Option<[a, s]>); Stream.iterate(a, f)
Stream.fromAsyncIterable(iter, (cause) => new MyError({ cause })); Stream.fromReadableStream({ evaluate, onError })
Stream.callback<A, E>((queue) => Effect<unknown, E, Scope>)   // Queue.offerUnsafe(queue, a) from callbacks; acquireRelease for cleanup
Stream.fromEventListener(target, "click"); Stream.unwrap(Effect<Stream>); Stream.scoped(Effect<A, E, Scope>)
fs.stream(path); handle.stdout; stdio.stdin; HttpClientResponse.stream(res); req.multipartStream
```

## Transform

```ts
Stream.map, Stream.filter, Stream.filterMap, Stream.mapEffect(f, { concurrency: 4, unordered?: true }), Stream.flatMap(f, { concurrency })
Stream.switchMap, Stream.scan(init, f), Stream.mapAccum, Stream.tap, Stream.zipWithIndex
Stream.take(n), takeWhile, takeUntil, drop, dropWhile
Stream.grouped(n), groupedWithin(n, "1 second"), sliding, chunks, rechunk(n), groupByKey
Stream.buffer({ capacity: 64 }), Stream.buffer({ capacity: 64, strategy: "sliding" | "dropping" })
Stream.debounce("300 millis"), Stream.throttle({ cost: (chunk) => chunk.length, units: 10, duration: "1 second", strategy: "shape" | "enforce" })
Stream.merge(a, b), Stream.mergeAll([...], { concurrency }), Stream.concat, Stream.zip, Stream.zipLatest, Stream.race
Stream.decodeText(), Stream.encodeText, Stream.splitLines
Stream.pipeThroughChannel(Ndjson.decodeSchema(S)()) / Ndjson.encodeSchema(S)() / Msgpack.*
Stream.catchTag / catchTags / catchCause / retry(schedule) / mapError / orDie / ensuring / onEnd / interruptWhen(deferred) / timeout
Stream.provide(layer), Stream.provideService(...)
```

Multicast: `const shared = yield* Stream.broadcast(source, { capacity: 16, replay: 1 })`
(scoped; every consumer sees every element) or `Stream.share(source, { idleTimeToLive })`.

## Consume

```ts
yield* Stream.runCollect(s)          // Array<A>; only for bounded streams
yield* Stream.runForEach(s, (a) => Effect<void>)
yield* Stream.runDrain(s)
yield* Stream.runFold(s, () => 0, (acc, a) => acc + a)
yield* Stream.runHead(s) / runLast(s)        // Option<A>
yield* Stream.run(s, Sink.sum) / Sink.count / Sink.collect<A>() / Sink.head() / Sink.forEach(f) / Sink.forEachArray(f) / Sink.fold(...)
yield* Stream.run(s, fs.sink(path)) / stdio.stdout() / handle.stdin
yield* Stream.runIntoQueue(s, queue)
Stream.toReadableStream(s); Stream.toAsyncIterable(s)   // hand to non-Effect consumers
const pull = yield* Stream.toPull(s)                     // manual pulling inside a Scope
```

`Sink.collectAll` does not exist; use `Sink.collect()`.

## Patterns

```ts
// log tail: file -> lines -> parse -> filter -> NDJSON out
fs.stream("app.log").pipe(
  Stream.decodeText(), Stream.splitLines,
  Stream.mapEffect((line) => Schema.decodeUnknownEffect(Schema.fromJsonString(LogEntry))(line), { concurrency: 8 }),
  Stream.filter((e) => e.level === "error"),
  Stream.pipeThroughChannel(Ndjson.encodeSchema(LogEntry)()),
  Stream.run(stdio.stdout())
)

// bounded worker pool over a queue with graceful end
Stream.fromQueue(jobs).pipe(
  Stream.mapEffect(process, { concurrency: 4, unordered: true }),
  Stream.runDrain
)
// producer: Queue.offer(jobs, job) ... Queue.end(jobs) when finished

// polling with backoff and change detection
Stream.fromEffectSchedule(fetchStatus, Schedule.spaced("5 seconds")).pipe(
  Stream.changes,             // only distinct consecutive values
  Stream.takeUntil((s) => s.done),
  Stream.runForEach(report)
)

// server-sent events response
HttpServerResponse.stream(events.pipe(Stream.map((e) => `data: ${JSON.stringify(e)}\n\n`), Stream.encodeText), { contentType: "text/event-stream" })
```

Failures inside a stream terminate it unless caught with `Stream.catch*`;
`Stream.retry(schedule)` re-subscribes from the source. Streams are lazy: nothing
runs until a `run*` is executed, and each run is an independent subscription
unless multicast.
