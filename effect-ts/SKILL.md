---
name: effect-ts
description: Build, review, or migrate TypeScript codebases using Effect v4 as their standard library and application framework. Covers scripts, reusable libraries and SDKs, CLIs, APIs, background services, browser apps, and Cloudflare Workers through composable internal modules. Use for Effect code and migrations to Effect; respect projects explicitly staying on v3. Sui-specific extension contracts belong to sui-effect-extension.
---

# Effect v4

Use Effect throughout the requested scope: Schema for data and boundaries,
Effect for fallible work, Context/Layer for dependencies, and the ecosystem for
concurrency, resources, streaming, persistence and application edges. Prefer an
existing Effect capability over a parallel custom implementation. Keep ordinary
pure TypeScript functions where they express the domain clearly; maximal adoption
means coherent semantics, not maximum wrappers.

This single skill replaces `effect-ts-library` and `effect-cloudflare-workers`.
Their knowledge lives below, with shared rules maintained once. The Sui extension
skill is separate and unchanged; old mentions of `effect-ts-library` route to
[this library module](references/library/index.md).

## Load composable knowledge

Read [core](references/core.md) and [services](references/services.md) first.
Select task modules below, recursively reading their **Requires** links once.
These are knowledge dependencies, not npm dependencies. Combine modules; do not
load every reference or the entire generated inventory into context.

| Task or concern | Module |
|---|---|
| New project, runtime and toolchain | [Project setup](references/project-setup.md) |
| Reusable package, SDK, shared application core | [Library](references/library/index.md) |
| Cloudflare HTTP/event Worker or Durable Object | [Cloudflare](references/cloudflare/index.md) |
| Existing TypeScript or Effect v3 migration | [Migration](references/migration.md) |
| Collections, matching, numbers, dates, encoding, type utilities | [Standard library](references/standard-library.md) |
| Validation, models, errors, codecs, JSON Schema | [Schema](references/schema.md) |
| Schedules, retries, caching, batching, fallback | [Resilience](references/resilience.md) |
| Fibers, state, coordination, transactional collections | [State and concurrency](references/state-and-concurrency.md) |
| Streams, sinks, channels, backpressure | [Streams](references/streams.md) |
| CLI, files, terminal, subprocesses | [CLI and platform I/O](references/cli.md) |
| HTTP clients/servers, typed APIs, OpenAPI, RPC | [HTTP](references/http.md) |
| SQL, persistence, workflows, cluster, event logs, AI | [Data and workflows](references/data-and-workflows.md) |
| UI atoms, hydration, sockets, worker protocols | [Reactivity and integrations](references/reactivity-and-integrations.md) |
| Tests, correctness evidence, logs, traces, metrics | [Testing and observability](references/testing-and-observability.md) |
| Discover any v4 feature or update this skill | [Source and coverage](references/source-and-coverage.md) |

Library builds on core + services + Schema. Cloudflare builds on core + services
+ HTTP; add library when extracting or consuming a reusable package. Scripts need
no publication workflow. Cross-cutting modules compose at any level.

## Version and source discipline

The checked baseline is **Effect 4.0.0-rc.115**, recorded in the
[source inventory](references/generated/modules.md). Inspect the target's
manifest and lockfile first; this baseline is not permission to upgrade existing
projects. Resolve an explicit v4 version for new work and compatible adapter peer
ranges. Do not assume `latest` means v4 or every `@effect/*` package shares its
version.

Read the matching source, declaration and relevant upstream test/example for APIs
in use. Use the searchable inventory to discover features, then verify exact
local overloads. Prefer public namespace subpath imports. `effect/unstable/*` is
public but version-sensitive; `internal` is implementation evidence, never an
application import. Follow [source and coverage](references/source-and-coverage.md).

## Shared correctness rules

- Keep `A`, `E`, `R` truthful. Typed failures, defects and interruption differ.
  Never erase recoverable errors with `orDie` to satisfy a signature or turn
  cancellation into success with `catchCause`.
- Use `Effect.gen` for composition and named `Effect.fn` for reusable effectful
  functions. Pure functions, overload implementations and untraced hot paths
  remain valid. Run effects at owned process/host/test boundaries.
- Use tagged errors for discrimination, Schema-backed errors for serialization.
  Upstream typed errors are valid contract members. Map unknown foreign failures
  deliberately; Schema.Defect is not a secret scrubber or lossless serializer.
- Decode untrusted inputs and encode wire outputs. Distinguish decoded and
  encoded types. A cast or SQL row generic does not validate data. Trusted pure
  internal values do not need repeated decoding.
- Services describe capabilities; Layers own construction, sharing and lifetime.
  Plain service values can use Context/provideService. Separate per-invocation
  identity from long-lived dependencies. No mandatory static-layer rule.
- Scope resources through their actual last use, including streamed bodies.
  Forward cancellation to supported APIs, acknowledge non-cancellable foreign
  work, and observe child failures. Wrapping a Promise does not make its remote
  operation cancellable.
- Set concurrency, buffer, cache, retry and deadline policies deliberately.
  Retry writes only with demonstrated idempotency/reconciliation. In-memory
  transactions and locks do not make remote effects atomic or durable.
- Obtain configurable time, randomness and environment through Effect services
  where behavior depends on them. Redacted values still need safe logging,
  serialization and access control.

## Deliver the requested codebase

For new work, choose runtime and modules, model contracts, implement a vertical
slice with live/test services, compose the edge, and expand from working behavior.
Entrypoint examples are in `assets/templates/`; a workerd starter is in
`assets/cloudflare-worker/`. Adapt these to the user's layout and toolchain.

For migration, follow the [behavior-preserving workflow](references/migration.md):
baseline observable behavior, convert one slice, compare outcomes, retain rollback
until verified. Audit remaining non-Effect seams and explain intentional native
boundaries, unsupported integrations and pure code.

Typecheck actual examples/consumer surfaces and test behavior in the real host.
Report what the evidence establishes and what is unverified. Effect's types and
tests support stated invariants; they are not a formal proof of arbitrary program
correctness. If formal proof is required, define a model, assumptions and
properties and use an appropriate proof/model-checking tool as well.
