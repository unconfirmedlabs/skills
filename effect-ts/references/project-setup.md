# Project setup (Bun + Effect v4)

## Install

```bash
bun init -y
bun add effect@rc @effect/platform-bun@rc          # no tag installs v3; @rc is v4
bun add -d @effect/language-service typescript @types/bun
# optional, same version as effect:
bun add @effect/sql-sqlite-bun@rc @effect/sql-pg@rc @effect/ai-anthropic@rc @effect/opentelemetry@rc
```

All `@effect/*` packages share one version with `effect`. Pin the exact rc
(`4.0.0-rc.N`) in `package.json`; unstable modules can break between rcs.
Check the installed version with `bun pm ls effect`.

## tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "skipLibCheck": true,
    "exactOptionalPropertyTypes": true,
    "allowImportingTsExtensions": true,
    "types": ["bun"],
    "plugins": [{ "name": "@effect/language-service" }]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`strict: true` is required. TypeScript 5.9+ (7 works). The language-service
plugin adds diagnostics for floating effects, `any`/`unknown` in the error
channel, `try/catch` inside generators, redundant `catch` on `never` errors, and
`console.log`/`Math.random`/`Date.now` where Effect services exist. Editor-only
by default; to fail `tsc` on them add `"prepare": "effect-language-service patch"`
to scripts. `bunx effect-language-service layerinfo` prints the layer graph.

## Imports

```ts
import { Effect, Layer, Context, Schema, Config } from "effect"   // stable core
import { FileSystem, Path } from "effect"                           // platform abstractions are core in v4
import { TestClock, TestConsole, TestSchema } from "effect/testing"
import { Command, Flag, Argument } from "effect/unstable/cli"
import { HttpRouter, HttpServerResponse, HttpClient } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { SqlClient, SqlSchema, SqlModel } from "effect/unstable/sql"
import { BunRuntime, BunServices, BunHttpServer } from "@effect/platform-bun"
```

Subpaths: `effect/<Module>` for any core module, `effect/testing`,
`effect/unstable/{ai,cli,cluster,devtools,encoding,eventlog,http,httpapi,observability,persistence,process,reactivity,rpc,schema,socket,sql,workers,workflow}`.
`effect/internal/*` is not public.

## Layout

```
src/
  domain/        Schema models, branded ids, TaggedError classes, state unions
  services/      one Context.Service per file: interface, `layer`, `layerTest`
  cli/ | http/   edges: commands or api definition + handlers (definition file separate from handlers)
  main.ts        wiring only: compose layers, BunRuntime.runMain
test/            bun test files
```

Service identifiers are path-like and unique: `"myapp/db/Database"`.

## Entrypoints

| Shape | Pattern |
|---|---|
| Script | `BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)))` |
| CLI | `cmd.pipe(Command.run({ version }), Effect.provide(BunServices.layer), BunRuntime.runMain)` |
| Server / worker | `BunRuntime.runMain(Layer.launch(AppLayer))` |
| Inside Hono / Bun.serve / tests | `const runtime = ManagedRuntime.make(AppLayer)` then `runtime.runPromise(effect)`; `runtime.dispose()` on shutdown |

`BunRuntime.runMain(effect, { disableErrorReporting?, teardown? })` installs
SIGINT/SIGTERM handlers, interrupts the root fiber, runs finalizers, sets the
exit code (1 on failure), and pretty-prints unhandled causes. The core runtime
keeps the process alive while fibers are suspended, so `Effect.runPromise`
alone also works for one-shot scripts, but loses signal handling.

`BunServices.layer` provides FileSystem, Path, Terminal, Stdio, ChildProcessSpawner,
and the WebSocket constructor. `BunHttpServer.layer({ port })` provides the HTTP
server. `BunHttpClient` re-exports `FetchHttpClient`.

## package.json scripts

```json
{
  "scripts": {
    "dev": "bun --hot src/main.ts",
    "start": "bun src/main.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "prepare": "effect-language-service patch"
  }
}
```

Templates that typecheck and run against `effect@4.0.0-rc.112` are in
`assets/templates/`: `script.ts`, `cli.ts`, `api.ts`, `worker.ts`,
`state-machine.ts`. Copy one, rename the domain, keep the wiring.
