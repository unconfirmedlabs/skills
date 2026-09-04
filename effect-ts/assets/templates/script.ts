// Minimal Effect script: read a JSON file, validate it, print a summary.
// Run: bun run script.ts ./input.json
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, FileSystem, Schema } from "effect"

class Task extends Schema.Class<Task>("Task")({
  id: Schema.Int,
  title: Schema.NonEmptyString,
  done: Schema.Boolean
}) {}

const TaskFile = Schema.Array(Task)

class MissingArgument extends Schema.TaggedError<MissingArgument>()("MissingArgument", {
  name: Schema.String
}) {}

const readTasks = Effect.fn("readTasks")(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs.readFileString(path)
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(TaskFile))(text)
})

const main = Effect.gen(function*() {
  const path = Bun.argv[2]
  if (path === undefined) {
    return yield* new MissingArgument({ name: "path" })
  }
  const tasks = yield* readTasks(path)
  const open = tasks.filter((t) => !t.done).length
  yield* Effect.log(`${tasks.length} tasks, ${open} open`)
}).pipe(
  Effect.provide(BunServices.layer)
)

BunRuntime.runMain(main)
