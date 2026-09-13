// A typed state machine held in a SubscriptionRef. Transitions are pure
// functions that return the next state or a typed error; the service is the
// only writer. This example is in-memory and does not implement crash recovery.
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"

// --- State: a tagged union with match/guards derived from the schema ---------
const Idle = Schema.TaggedStruct("Idle", {})
const Running = Schema.TaggedStruct("Running", { jobId: Schema.String, startedAt: Schema.Number })
const Done = Schema.TaggedStruct("Done", { jobId: Schema.String, output: Schema.String })
const Failed = Schema.TaggedStruct("Failed", { jobId: Schema.String, reason: Schema.String })

const JobState = Schema.Union([Idle, Running, Done, Failed]).pipe(Schema.toTaggedUnion("_tag"))
type JobState = typeof JobState.Type

// --- Events: same pattern, so they can be decoded from JSON or a queue ------
const JobEvent = Schema.Union([
  Schema.TaggedStruct("Start", { jobId: Schema.String, now: Schema.Number }),
  Schema.TaggedStruct("Succeed", { output: Schema.String }),
  Schema.TaggedStruct("Fail", { reason: Schema.String }),
  Schema.TaggedStruct("Reset", {})
]).pipe(Schema.toTaggedUnion("_tag"))
type JobEvent = typeof JobEvent.Type

class InvalidTransition extends Schema.TaggedError<InvalidTransition>()("InvalidTransition", {
  from: Schema.String,
  event: Schema.String
}) {}

// --- Pure transition table ------------------------------------------------
const transition = (state: JobState, event: JobEvent): JobState | InvalidTransition => {
  const invalid = () => new InvalidTransition({ from: state._tag, event: event._tag })
  return JobState.match(state, {
    Idle: () => event._tag === "Start" ? Running.make({ jobId: event.jobId, startedAt: event.now }) : invalid(),
    Running: (s) =>
      JobEvent.matchOrElse(event, {
        Succeed: (e) => Done.make({ jobId: s.jobId, output: e.output }),
        Fail: (e) => Failed.make({ jobId: s.jobId, reason: e.reason })
      }, invalid),
    Done: () => event._tag === "Reset" ? Idle.make({}) : invalid(),
    Failed: () => event._tag === "Reset" ? Idle.make({}) : invalid()
  })
}

// --- Service: the only writer ---------------------------------------------
export class JobMachine extends Context.Service<JobMachine, {
  dispatch(event: JobEvent): Effect.Effect<JobState, InvalidTransition>
  readonly current: Effect.Effect<JobState>
  readonly changes: Stream.Stream<JobState>
}>()("app/JobMachine") {
  static readonly layer = Layer.effect(
    JobMachine,
    Effect.gen(function*() {
      const ref = yield* SubscriptionRef.make<JobState>(Idle.make({}))

      const dispatch = Effect.fn("JobMachine.dispatch")(function*(event: JobEvent) {
        const next = yield* SubscriptionRef.modifyEffect(ref, (state) => {
          const result = transition(state, event)
          return result instanceof InvalidTransition
            ? Effect.fail(result)
            : Effect.succeed([result, result] as const)
        })
        yield* Effect.logInfo("transition", { event: event._tag, to: next._tag })
        return next
      })

      return JobMachine.of({
        dispatch,
        current: SubscriptionRef.get(ref),
        changes: SubscriptionRef.changes(ref)
      })
    })
  )
}

const program = Effect.gen(function*() {
  const machine = yield* JobMachine
  yield* machine.changes.pipe(
    Stream.runForEach((s) => Effect.log(`state=${s._tag}`)),
    Effect.forkScoped
  )
  yield* machine.dispatch({ _tag: "Start", jobId: "j1", now: 0 })
  yield* machine.dispatch({ _tag: "Succeed", output: "ok" })
  yield* machine.dispatch({ _tag: "Succeed", output: "again" }).pipe(
    Effect.catchTag("InvalidTransition", (e) => Effect.logWarning(`rejected ${e.event} from ${e.from}`))
  )
}).pipe(
  Effect.scoped,
  Effect.provide(JobMachine.layer)
)

BunRuntime.runMain(program)
