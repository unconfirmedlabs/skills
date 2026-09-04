// CLI entrypoint: subcommands, typed flags, JSON to stdout, diagnostics to stderr.
// Run: bun run cli.ts tasks list --json
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

const json = Flag.boolean("json").pipe(
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
    title: Argument.string("title").pipe(Argument.withSchema(Schema.NonEmptyString)),
    priority: Flag.choice("priority", Priority.literals).pipe(Flag.withDefault("normal")),
    assignee: Flag.string("assignee").pipe(Flag.optional)
  },
  Effect.fn(function*({ assignee, priority, title }) {
    const { json } = yield* root
    const task = { title, priority, assignee: Option.getOrUndefined(assignee) }
    if (json) {
      return yield* Console.log(JSON.stringify(task))
    }
    yield* Console.error(`created "${title}" (${priority})`)
  })
).pipe(Command.withDescription("Create a task"))

const list = Command.make(
  "list",
  { status: Flag.choice("status", ["open", "done", "all"]).pipe(Flag.withDefault("open")) },
  Effect.fn(function*({ status }) {
    const { json } = yield* root
    const items = [{ title: "Ship", status: "open" }]
    const out = status === "all" ? items : items.filter((i) => i.status === status)
    yield* Console.log(json ? JSON.stringify(out) : out.map((i) => `- ${i.title}`).join("\n"))
  })
).pipe(Command.withDescription("List tasks"), Command.withAlias("ls"))

root.pipe(
  Command.withSubcommands([create, list]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
)
