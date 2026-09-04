// Long-running worker: a bounded queue, N consumers, graceful shutdown.
// Run: bun run worker.ts   (Ctrl-C interrupts fibers and runs finalizers)
import { BunRuntime } from "@effect/platform-bun"
import { Context, Effect, Layer, Queue, Schedule, Schema } from "effect"

class Job extends Schema.Class<Job>("Job")({ id: Schema.Int, payload: Schema.String }) {}

class JobFailed extends Schema.TaggedError<JobFailed>()("JobFailed", { id: Schema.Int, cause: Schema.Defect() }) {}

class Jobs extends Context.Service<Jobs, {
  enqueue(job: Job): Effect.Effect<void>
  readonly take: Effect.Effect<Job>
}>()("app/Jobs") {
  static readonly layer = Layer.effect(
    Jobs,
    Effect.gen(function*() {
      const queue = yield* Queue.bounded<Job>(100)
      yield* Effect.addFinalizer(() => Queue.shutdown(queue))
      return Jobs.of({
        enqueue: (job) => Queue.offer(queue, job).pipe(Effect.asVoid),
        take: Queue.take(queue)
      })
    })
  )
}

const process = Effect.fn("process")(function*(job: Job) {
  yield* Effect.logInfo("processing", { id: job.id })
  yield* Effect.sleep("100 millis")
})

const consumer = (n: number) =>
  Effect.gen(function*() {
    const jobs = yield* Jobs
    while (true) {
      const job = yield* jobs.take
      yield* process(job).pipe(
        Effect.retry({ schedule: Schedule.exponential("50 millis"), times: 3 }),
        Effect.catchCause((cause) => Effect.logError(new JobFailed({ id: job.id, cause })))
      )
    }
  }).pipe(Effect.annotateLogs({ consumer: n }))

const Consumers = Layer.effectDiscard(
  Effect.forEach([1, 2, 3], (n) => Effect.forkScoped(consumer(n)))
)

const Producer = Layer.effectDiscard(Effect.gen(function*() {
  const jobs = yield* Jobs
  yield* Effect.forkScoped(
    Effect.gen(function*() {
      let id = 0
      while (true) {
        yield* jobs.enqueue(new Job({ id: id++, payload: "work" }))
        yield* Effect.sleep("1 second")
      }
    })
  )
}))

const Main = Layer.mergeAll(Consumers, Producer).pipe(Layer.provide(Jobs.layer))

BunRuntime.runMain(Layer.launch(Main))
