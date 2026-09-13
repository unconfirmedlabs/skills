// Node ESM example. Compile with NodeNext, then run the emitted JavaScript.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"

const main = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs.readDirectory(".")
  yield* Console.log(JSON.stringify(entries))
})
NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
