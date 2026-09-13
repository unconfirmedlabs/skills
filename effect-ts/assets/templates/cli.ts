// CLI entrypoint: subcommands, typed flags, JSON to stdout, diagnostics to stderr.
// Run: bun run cli.ts list --json
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import * as Logger from "effect/Logger"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"

// Data has an explicit stdout sink; built-in help/errors use the Console service.
const writeData = Effect.fn("writeData")(function*(text: string) {
  const stdio = yield* Stdio.Stdio
  yield* Stream.run(Stream.succeed(text + "\n"), stdio.stdout())
})

const json = Flag.Boolean("json").pipe(
  Flag.withDescription("Emit machine-readable JSON on stdout"),
  Flag.withDefault(false)
)

const root = Command.make("tasks").pipe(
  Command.withSharedFlags({ json }),
  Command.withDescription("Track and manage tasks")
)

const Priority = Schema.Literals(["low", "normal", "high"])

const create = Command.make(
  "create",
  {
    title: Argument.String("title").pipe(Argument.withSchema(Schema.NonEmptyString)),
    priority: Flag.Literals("priority", Priority.literals).pipe(Flag.withDefault("normal")),
    assignee: Flag.String("assignee").pipe(Flag.optional)
  },
  Effect.fn(function*({ assignee, priority, title }) {
    const { json } = yield* root
    const task = { title, priority, assignee: Option.getOrUndefined(assignee) }
    if (json) {
      return yield* writeData(JSON.stringify(task))
    }
    yield* Console.error(`created "${title}" (${priority})`)
  })
).pipe(Command.withDescription("Create a task"))

const list = Command.make(
  "list",
  { status: Flag.Literals("status", ["open", "done", "all"]).pipe(Flag.withDefault("open")) },
  Effect.fn(function*({ status }) {
    const { json } = yield* root
    const items = [{ title: "Ship", status: "open" }]
    const out = status === "all" ? items : items.filter((i) => i.status === status)
    yield* writeData(json ? JSON.stringify(out) : out.map((i) => `- ${i.title}`).join("\n"))
  })
).pipe(Command.withDescription("List tasks"), Command.withAlias("ls"))

root.pipe(
  Command.withSubcommands([create, list]),
  Command.run({ version: "0.1.0" }),
  // rc.115 prints parser help through Console.log even with renderErrors:false.
  // This starter routes built-in help/version/diagnostics to stderr, data to stdout.
  Effect.updateService(Console.Console, current => ({
    ...current,
    log: (...args) => current.error(...args)
  })),
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
)
