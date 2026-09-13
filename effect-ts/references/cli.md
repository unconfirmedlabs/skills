# CLI, processes, filesystem, stdio

Requires: [services](services.md), [Schema](schema.md), [streams](streams.md).
API sketches below need their domain definitions and target-version verification.

Imports: `effect/unstable/cli` (Command, Flag, Argument, Prompt, GlobalFlag,
CliConfig, CliOutput, CliError, Completions), `effect` (FileSystem, Path,
Stdio, Terminal, Console, PlatformError), `effect/unstable/process`
(ChildProcess, ChildProcessSpawner), `effect/unstable/persistence`
(KeyValueStore), `effect/unstable/encoding` (Ndjson, Msgpack, Yaml, Toml, Ini).
`BunServices.layer` from `@effect/platform-bun` satisfies every requirement.

For broader product design, the optional `cli-design` skill can help. The local contract is: stdout carries
data, stderr carries diagnostics, exit status is typed, no implicit prompts.

## Commands

```ts
const root = Command.make("tasks").pipe(
  Command.withSharedFlags({ json: Flag.Boolean("json").pipe(Flag.withDefault(false)) }),   // visible to subcommands
  Command.withDescription("Track tasks")
)

const create = Command.make(
  "create",
  {
    title: Argument.String("title").pipe(Argument.withSchema(Schema.NonEmptyString)),
    priority: Flag.Literals("priority", ["low", "normal", "high"]).pipe(Flag.withDefault("normal")),
    assignee: Flag.String("assignee").pipe(Flag.withSchema(Email), Flag.optional),     // Option<string>
    tags: Flag.String("tag").pipe(Flag.atLeast(0)),                                    // repeated flag -> ReadonlyArray
    files: Argument.String("files").pipe(Argument.variadic({ min: 1 }))
  },
  Effect.fn(function*({ title, priority, assignee, tags, files }) {
    const { json } = yield* root          // a Command is an Effect: yield* the parent to read shared flags
    ...
  })
).pipe(Command.withDescription("Create a task"), Command.withAlias("c"), Command.withExamples([{ command: "tasks create x --priority high", description: "..." }]))

root.pipe(
  Command.withSubcommands([create, list]),          // also { group: "Admin", commands: [...] } entries
  Command.run({ version: "1.0.0" }),                // name comes from Command.make; renderErrors?: boolean
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
)
```

- Handler input type is inferred from the config object; nested objects allowed.
- `Command.withHandler(fn)` attaches a handler later; `Command.unlisted` hides from help.
- `Command.provide(layer | (input) => layer)`, `provideEffect(Key, effect | (input) => effect)`,
  `provideSync` build dependencies from parsed input (e.g. DB client from `--db-url`).
- `Command.runWith(cmd, { version })(argv)` for tests; `Command.run` reads `Stdio.args`.
- Built-in global flags: `--help/-h`, `--version/-v`, `--completions bash|zsh|fish`,
  `--log-level`, wizard mode. Add your own once:
  `const jsonOut = GlobalFlag.Setting("json-output")({ flag: Flag.Boolean("json").pipe(Flag.withDefault(false)) })`,
  read it in any handler with `yield* jsonOut`, and apply
  `Command.withGlobalFlags([jsonOut])` to the root **after** `withSubcommands`
  (it removes the setting from the requirements of every handler beneath it).
  `GlobalFlag.Action({ flag, run })` for side-effect flags that exit.
- Output rendering: `CliOutput.layer(CliOutput.defaultFormatter({ colors: false }))`.
  Colors off and no prompts when `Stdio.stdoutIsTerminal` / `stdinIsTerminal` is false.

### Flags and arguments

Constructors in rc.115 are capitalized: `String, Boolean` (Flag), `Int, Finite, Date, Literals(name, [...])`,
`ChoiceWithValue(name, [["a", A]])`, `Path(name, { pathType, mustExist })`, `File`,
`Directory`, `Redacted` (Redacted<string>), `FileText`, `FileParse`
(json/yaml/toml/ini by extension), `FileSchema(name, schema)`, `KeyValuePair` (Flag)
(Record<string,string>), `Never`.

Modifiers: `withAlias` (Flag only), `withDescription`, `withMetavar`, `withHidden`,
`withDefault(value | Effect)`, `optional` (Option), `withFallbackConfig(Config.String("X"))`
(env var fallback), `withFallbackPrompt(prompt)` (only when interactive),
`withSchema(schema)`, `map`, `mapEffect`, `mapTryCatch`, `filter`, `filterMap`,
`orElse`, `atLeast(n)`, `atMost(n)`, `between(min, max)`, `Argument.variadic({ min, max })`.

### Errors and exit codes

`CliError` union: `UnrecognizedOption | DuplicateOption | MissingOption | MissingArgument
| UnexpectedArgument | InvalidValue | UnknownSubcommand | ShowHelp | UserError`.
Parse errors render help and exit 1. Handler failures propagate to
`BunRuntime.runMain`, which prints the cause and exits 1. To control the code,
fail with `new CliError.UserError({ cause })` or attach `Runtime.errorExitCode`.
For machine-readable errors, own the rendering and test actual argv failures.
In rc.115 `renderErrors: false` disables formatted errors but still prints
ShowHelp through Console.log. Merely setting that flag does not keep stdout clean.
The CLI starter separates data into a Stdio stdout sink and routes built-in
help/version/diagnostics through a stderr Console override. If explicit help must
go to stdout, implement that policy separately and test both parse failure and
explicit-help paths.

## Prompts (interactive only)

```ts
const answers = yield* Prompt.all({
  name: Prompt.String({ message: "Project name?", default: "app", validate: (s) => s.length ? Effect.succeed(s) : Effect.fail("required") }),
  env: Prompt.Select({ message: "Env", choices: [{ title: "staging", value: "staging" }, { title: "prod", value: "prod" }] }),
  ok: Prompt.Confirm({ message: "Continue?", initial: true })
})
```

Also `Password`, `Hidden`, `Toggle`, `MultiSelect`, `AutoComplete`, `Int`,
`Number`, `Date`, `List`, `File`. A `Prompt` is an Effect; cancelling fails with
`Terminal.QuitError`. Guard with `if (yield* (yield* Stdio.Stdio).stdinIsTerminal)`
or prefer `Flag.withFallbackPrompt` so non-TTY callers get a clean error.

## FileSystem and Path

```ts
const fs = yield* FileSystem.FileSystem
const path = yield* Path.Path
yield* fs.exists(p); yield* fs.readFileString(p); yield* fs.writeFileString(p, text)
yield* fs.readFile(p) /* Uint8Array */; yield* fs.writeFile(p, bytes, { flag: "a" })
yield* fs.makeDirectory(p, { recursive: true }); yield* fs.readDirectory(p, { recursive: true })
yield* fs.stat(p); yield* fs.remove(p, { recursive: true, force: true }); yield* fs.rename(a, b); yield* fs.copy(a, b)
yield* fs.glob("**/*.ts", { root, exclude }); const tmp = yield* fs.makeTempDirectoryScoped()
fs.stream(p) /* Stream<Uint8Array> */; fs.sink(p) /* Sink */; fs.watch(p) /* Stream<Create|Update|Remove> */
const file = yield* fs.open(p, { flag: "r" })   // scoped handle: read/readAlloc/write/writeAll/seek/truncate
path.join(...); path.resolve(...); path.dirname(p); path.basename(p, ".ts"); path.extname(p); path.relative(a, b)
```

Failures are `PlatformError` with `error.reason._tag` in `"BadArgument" |
"NotFound" | "AlreadyExists" | "PermissionDenied" | "Busy" | "TimedOut" | ...`.
Wrap into a domain error at the service boundary. `FileSystem.layerNoop({...})`
and `Path.layer` give test implementations; `Stdio.layerTest({ args })` fakes argv.

Read a typed JSON/YAML config: `Schema.decodeUnknownEffect(Schema.fromJsonString(S))(text)`
or `Schema.decodeUnknownEffect(S)(Yaml.parse(text))`.

## Child processes

```ts
const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
const cmd = ChildProcess.make("git", ["diff", "--name-only"], { cwd, env: { FORCE_COLOR: "1" }, extendEnv: true })
// also template form: ChildProcess.make`git status`  and ChildProcess.make({ cwd })`ls`
yield* spawner.string(cmd)                     // whole stdout
yield* spawner.lines(cmd)                      // Array<string>
yield* spawner.exitCode(cmd)                   // ExitCode
spawner.streamLines(cmd, { includeStderr: true })   // Stream<string>
const handle = yield* spawner.spawn(cmd)       // needs Scope: pid, stdout/stderr/all streams, stdin sink, exitCode, kill()
yield* handle.all.pipe(Stream.decodeText(), Stream.splitLines, Stream.runForEach(Console.error))
ChildProcess.make("git", ["log"]).pipe(ChildProcess.pipeTo(ChildProcess.make("head", ["-n", "5"])))
```

`extendEnv: false` is the default, so set `extendEnv: true` to inherit PATH.
Avoid `shell: true`; pass argv arrays, never interpolate untrusted strings.
Non-zero exit does not fail `string`/`lines` by itself; check `exitCode`.

## Stdio and Console

```ts
const stdio = yield* Stdio.Stdio
yield* stdio.args; yield* stdio.stdinIsTerminal; yield* stdio.stdoutIsTerminal
stdio.stdin.pipe(Stream.decodeText(), Stream.splitLines)      // read lines
Stream.run(stdio.stdout())                                     // Sink<string | Uint8Array>
yield* Console.log(JSON.stringify(result))                     // data -> stdout
yield* Console.error("diagnostic")                             // diagnostics -> stderr
```

Send logs to stderr in CLIs so stdout stays parseable:
`Logger.layer([Logger.consolePretty({ stderr: true })])` or `Layer.succeed(Logger.LogToStderr, true)`.

## Streams of records

```ts
stdio.stdin.pipe(Stream.pipeThroughChannel(Ndjson.decodeSchema(Event)()), Stream.mapEffect(handle), Stream.pipeThroughChannel(Ndjson.encodeSchema(Result)()), Stream.run(stdio.stdout()))
```

`Ndjson.decodeString/encodeString` for string streams, `decode/encode` for
bytes, `*Schema*` variants validate. `Msgpack` mirrors it. `Yaml.parse`,
`Toml.parse`, `Ini.parse` are decode-only.

## Local state

```ts
const kv = yield* KeyValueStore.KeyValueStore
const store = KeyValueStore.toSchemaStore(KeyValueStore.prefix(kv, "session:"), SessionState)
yield* store.set("current", state); const s = yield* store.get("current")   // Option<SessionState>
```

Layers: `KeyValueStore.layerMemory`, `layerFileSystem(dir)` (one file per key),
`layerSql()`, `layerStorage(() => localStorage)`. Use this to persist a state
machine between CLI invocations; write the full state document on every
transition only when that write has the atomicity/durability the contract needs. A KV write
is not atomic with a separate external side effect; use a transaction/outbox or
reconciliation protocol for that guarantee.

## CLI and process verification

Test the actual executable invocation, not just Command handlers. Assert stdout,
stderr, exit status, help/version, malformed argv, non-TTY behavior, SIGINT and
streamed stdin/stdout. Diagnostic logging must not corrupt machine-readable output.

ChildProcess helpers can return stdout from a process that exits nonzero; check
the exit-code policy explicitly. Concurrently drain both output streams where
needed to avoid blocking, bound buffering, and define signal/kill escalation and
cleanup. Pass argument arrays and preserve environment/cwd deliberately. File
operations also need clear atomic replacement, permissions and symlink policy
when those affect correctness; a FileSystem service does not invent these rules.
