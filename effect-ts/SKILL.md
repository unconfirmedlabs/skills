---
name: effect-ts
description: Build or migrate TypeScript projects on Effect v4 (effect@rc) with Bun. Use when starting any TypeScript project (script, CLI, HTTP API, background worker, agent tool), when adding Effect to an existing codebase, when writing or reviewing code that imports from "effect", or when the task needs typed errors, dependency injection via Layers, Schema validation, retries, concurrency, streams, durable workflows, or predictable state machines for agent workflows. For a Cloudflare Worker, also use the sibling effect-cloudflare-workers skill. Not for Effect v3 codebases that must stay on v3 (see the migration reference for the v3-to-v4 map instead).
---

# Effect v4 on Bun

Effect is the standard library and runtime for every TypeScript project here.
One program type, `Effect<Success, Error, Requirements>`, carries the value, the
typed failure, and the services a computation needs. Errors are values, side
effects are lazy, dependencies are types the compiler checks, and every
operation is cancellable and observable. That structure is what makes code
predictable for agents: a function's signature states exactly what can go
wrong and what it needs, and state changes happen only through explicit,
typed transitions.

Target `effect@rc` (v4). Names differ from v3 in ways that break compilation;
never write v3 names from memory. Verify against the installed package under
`node_modules/effect/dist/*.d.ts` and `node_modules/effect/ai-docs/` when unsure.

## Invariants

- Write Effect code with `Effect.gen` and `Effect.fn("Name")`. Attach behaviour
  with combinators after. Never return `Effect.gen` from a plain function; use
  `Effect.fn`. Never `.pipe` on the result of `Effect.fn`; pass combinators as
  extra arguments.
- Every failure is a `Schema.TaggedError` (or `Schema.Error` when no tag is
  needed) with a unique `_tag`. Recover with `Effect.catchTag`, `catchTags`,
  `catchReason(s)`. `Effect.catch` catches all. Unexpected failures are defects:
  wrap with `Effect.orDie` or `Effect.die`, never swallow.
- Always `return yield* new SomeError(...)` when failing inside a generator so
  TypeScript narrows control flow.
- Every dependency is a `Context.Service` with a `static layer`. Compose layers
  with `Layer.provide` (hide deps) or `Layer.provideMerge` (expose deps) and
  provide once at the entrypoint. Layers are memoized per object identity.
- Validate every boundary (argv, env, HTTP, DB rows, files, LLM output) with
  `Schema`. Never hand-roll parsers or type guards; use `Schema` and `Predicate`.
- Read time with `DateTime.now` / `Clock`, randomness with `Random`, config with
  `Config`, so tests can control them with `TestClock` and `ConfigProvider`.
- Run once at the edge: `BunRuntime.runMain` for processes, `Layer.launch` for
  long-running apps, `ManagedRuntime` inside non-Effect frameworks. Never call
  `Effect.runPromise` deep inside library code.
- Model state as a tagged union (`Schema.Union` of `Schema.TaggedStruct`), keep
  it in `Ref` / `SubscriptionRef` / `TxRef`, and change it only through
  transition functions that return the next state or a typed error.
- Prefer stable `effect/*` modules; anything under `effect/unstable/*` (cli,
  http, httpapi, rpc, sql, ai, workflow, persistence) may break in minor
  releases, so pin exact versions and keep those imports behind services.

## Compose references

Load only the references the task needs; combining is normal.

| Situation | Read |
|---|---|
| Any new or migrated project | [project-setup](references/project-setup.md), [core](references/core.md) |
| Defining services, layers, config, resources, entrypoints | [services](references/services.md) |
| Domain models, validation, typed errors, JSON codecs | [schema](references/schema.md) |
| Retries, timeouts, rate limits, caching, fallback plans | [resilience](references/resilience.md) |
| Fibers, queues, pub/sub, refs, transactions, state machines | [state-and-concurrency](references/state-and-concurrency.md) |
| Streams, NDJSON, backpressure, file or process output | [streams](references/streams.md) |
| CLI commands, flags, prompts, filesystem, child processes | [cli](references/cli.md) plus the `cli-design` skill for the I/O contract |
| HTTP servers, typed APIs, OpenAPI, HTTP clients, RPC, websockets | [http](references/http.md) |
| Cloudflare Worker HTTP/event entrypoints, bindings, cache, workerd tests | Use the sibling `effect-cloudflare-workers` skill |
| SQL, key-value stores, durable workflows, cluster entities, LLM calls | [data-and-workflows](references/data-and-workflows.md) |
| Tests, logging, tracing, metrics, devtools | [testing-and-observability](references/testing-and-observability.md) |
| Existing code, v3 names, incremental adoption | [migration](references/migration.md) |

Ready-to-copy entrypoints live in `assets/templates/` (`script.ts`, `cli.ts`,
`api.ts`, `worker.ts`; the latter is a long-running queue consumer, not a
Cloudflare Worker). They typecheck against `effect@4.0.0-rc.112`.

## New project

1. `bun init`, then `bun add effect@rc @effect/platform-bun@rc`. Confirm
   `"strict": true`. Add the language-service plugin (project-setup).
2. Lay out `src/` by capability: `domain/` (Schema models and errors),
   `services/` (one `Context.Service` per file with `layer` and, when useful,
   `layerTest`), `cli/` or `http/` (edges), `main.ts` (wiring only).
3. Write the domain first: models with `Schema.Class`, errors with
   `Schema.TaggedError`, state unions with `Schema.TaggedStruct`.
4. Write services against interfaces, then the live layer, then a test layer
   backed by `Ref`. Compose in `main.ts`; run with `BunRuntime.runMain`.
5. Add tests with `bun test`, providing test layers and `TestClock`.
6. Typecheck with `bunx tsc --noEmit` before claiming done.

## Migrate an existing project

Order work by impact, not by file count. Each step leaves the project shippable.

1. Inventory the edges: entrypoints, env parsing, network and DB calls, retry
   loops, ad-hoc error classes, global singletons, `setTimeout` state.
2. Install `effect@rc`. Put a `ManagedRuntime` at each edge so existing
   handlers can run Effects without rewriting callers.
3. Replace boundary parsing with `Schema` first; it removes the largest class of
   runtime bugs and creates the domain types everything else uses.
4. Wrap external calls with `Effect.tryPromise` / `Effect.try` into typed errors
   behind `Context.Service` interfaces. Provide live layers from the runtime.
5. Replace hand-written retry, timeout, and concurrency code with `Schedule`,
   `Effect.retry`, `Effect.timeout`, `Effect.forEach({ concurrency })`.
6. Move state into `Ref` / `SubscriptionRef` with explicit transition functions.
7. Convert the entrypoint to `BunRuntime.runMain` and delete the runtime bridge
   once no non-Effect callers remain.
8. If the code is on Effect v3, apply the rename map in the migration reference
   before any other step.

## Review checklist

Reject code that: uses v3 names (`Context.Tag`, `Effect.Service`, `Either`,
`catchAll`, `Effect.fork`, `Layer.scoped`, `Schema.filter`); throws inside
Effects; calls `run*` outside the entrypoint; leaks `unknown` errors; defines
services without a layer; reads `process.env` or `Date.now()` directly; keeps
mutable module-level state; or loses interruption by mixing raw Promises.
