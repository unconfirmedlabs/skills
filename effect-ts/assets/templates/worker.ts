// Long-running worker: a bounded queue, N consumers, graceful shutdown.
// Run: bun run worker.ts   (Ctrl-C interrupts fibers and runs finalizers)
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"

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

const processJob = Effect.fn("processJob")(function*(job: Job) {
  if (job.payload.length === 0) return yield* new JobFailed({ id: job.id, cause: "empty payload" })
  yield* Effect.logInfo("processing", { id: job.id })
  yield* Effect.sleep("100 millis")
})

const consumer = Effect.fn("consumer")(function*(n: number) {
  const jobs = yield* Jobs
  while (true) {
    const job = yield* jobs.take
    // This example logs rejected jobs; a production queue needs explicit retry/DLQ policy.
    // Recover known job errors only. Defects and interruption reach the owning program.
    yield* processJob(job).pipe(
      Effect.catchTag("JobFailed", error => Effect.logWarning("job rejected", error)),
      Effect.annotateLogs({ consumer: n })
    )
  }
})

const producer = Effect.gen(function*() {
  const jobs = yield* Jobs
  let id = 0
  while (true) {
    yield* jobs.enqueue(new Job({ id: id++, payload: "work" }))
    yield* Effect.sleep("1 second")
  }
})

// all owns every loop: a fatal failure interrupts siblings and reaches runMain.
// Queue.shutdown is a Layer finalizer; SIGINT stops the program and releases it.
const main = Effect.all([producer, consumer(1), consumer(2), consumer(3)], {
  concurrency: "unbounded",
  discard: true
}).pipe(Effect.provide(Jobs.layer))

BunRuntime.runMain(main)
