# Migrate TypeScript to Effect with checked behavioral equivalence

Requires: [core](core.md), [services](services.md), [Schema](schema.md),
[testing and observability](testing-and-observability.md). Add the source and
runtime modules for each slice; library/public API migration also needs
[library](library/index.md).

## Establish the contract before converting

Inventory entrypoints, public exports, input/output representations, exceptions,
async callbacks, retries/timeouts, globals, listeners/timers, streams, databases,
transaction boundaries, caches and mutation protocols. Read production-facing
examples and existing tests. Record the actual runtime, dependencies and lockfile.

For each operation, identify:

- success values, absence semantics, ordering and side effects;
- failure classes/status codes/exit codes, defects and cancellation behavior;
- accepted/rejected inputs, normalization, missing/null/undefined and excess keys;
- wire bytes, serialization, HTTP headers, CLI stdout/stderr and streaming shape;
- dependency lifetime, resource release and what remains after cancellation;
- concurrency, retries, deadline placement, idempotency and ambiguous outcomes;
- durability, restart/redelivery behavior, schema and external compatibility.

Turn important existing behavior into characterization tests. Separate a desired
behavior change from a behavior-preserving refactor: e.g. adding cancellation,
validation, bounded fan-out or a timeout changes semantics even if it is useful.
State the intended new contract instead of calling that equivalent.

## Convert one vertical slice

1. Keep the current entrypoint/framework. Add a scoped runtime bridge or an
   explicit adapter at the real host boundary. Existing Promise callers can
   keep their signatures while the inside becomes Effect.
2. Model input/output/error contracts. Decode foreign values with Schema, but
   preserve existing acceptance/normalization behavior unless changing it is
   part of the task. Encode outputs; a decoded Class is not automatically the
   legacy JSON payload.
3. Put the external capability behind a small service. Wrap possible throw/reject
   with `Effect.try`/`tryPromise`, mapping unknown failures to truthful errors.
   Forward supported signals; keep remote outcome ambiguity after cancellation.
4. Compose the operation with Effect.gen/fn. Retain caller-visible `A`, `E`, `R`
   and translate errors only where the old/new boundary requires it. A Promise
   facade's rejected value may differ from an Exit; test that contract.
5. Replace manual scheduling/concurrency/resources with matching Effect semantics.
   Select first-success vs first-exit race, sibling cancellation vs all-results,
   inner vs outer timeout, retry classification and scope lifetime deliberately.
6. Compare old/new results and observable traces with the same inputs and
   deterministic dependency scripts. Avoid executing a real mutation twice in
   differential tests; use isolated stores, captured replay inputs or fakes.
7. Route the slice through the new path once its checks pass. Keep a rollback
   seam appropriate to deployment/storage risk. Remove its dead adapters and
   duplicated retry/error/validation logic after callers have moved.

Finish one coherent slice before bulk mechanical expansion. The framework can
remain when it still owns a useful host contract. If replacing it is part of the
task, migrate HTTP/CLI behavior explicitly and verify the exported edge.

## Maximal adoption audit

Map each remaining custom mechanism to its Effect equivalent and disposition:

| Existing mechanism | Candidate |
|---|---|
| Runtime validation/manual JSON conversions | Schema/codec, Config |
| Promise chains and throw/catch taxonomy | Effect composition and typed errors |
| Global clients/dependency injection | Context + scoped Layers |
| Timers/retry loops/timeout races | Clock, Schedule, retry/timeout with matching semantics |
| Promise.all, ad-hoc pools/locks | all/forEach, Semaphore, Ref/Tx collections |
| Event listeners/async iterables/unbounded buffering | Stream/Queue/PubSub with owned cleanup |
| Manual acquire/finally/pool bookkeeping | Scope, acquireRelease, Pool/Rc resources |
| Caches and batch lookups | Cache/ScopedCache/RequestResolver |
| HTTP/CLI/SQL/AI/custom RPC framework pieces | Relevant Effect capability and host adapter |
| UI async state and subscriptions | Atom/AtomRegistry + framework adapter |
| Durable job loops and multi-step operations | Persistent queue/workflow/cluster only when needed |
| Pure helpers/collections/parsing | Standard library modules where they improve clarity |

Classify each seam as converted, intentionally pure/native, unsupported adapter,
or deferred with a concrete reason. Do not force wrappers around arithmetic,
pure domain functions or the host's unavoidable native handler. Maximal adoption
should remove competing mechanisms, not add ceremonial services to every value.

## Effect v3 to v4

Pin intended compatible packages and work from the matching v4 checkout's
`migration/` guides and generated annotations. Verify each replacement in source:
even an upstream migration page can be stale. In 4.0.3 Option/Result are still
not directly yieldable in `Effect.gen` despite old migration notes saying otherwise.

| v3 seam | v4 direction and semantic review |
|---|---|
| Context.Tag/GenericTag, Effect.Service defaults | Context.Service with explicit construction/Layer composition; retain key identity and lifetime |
| Layer.scoped | Layer.effect owns scoped acquisition; check memoization and sharing |
| Effect.async | Effect.callback; return correct cleanup and wire interruption |
| catchAll/catchAllCause/catchAllDefect | catch/catchCause/catchDefect; preserve interruption rather than swallowing all causes |
| fork/forkDaemon | forkChild/forkDetach; revisit ownership and observe failure |
| Either/Effect.either | Result/Effect.result; use fromResult/fromOption to lift values |
| FiberRef-based ambient policy | Context.Reference/References and service provisioning; test scope/overrides |
| TRef/TMap/etc and STM | TxRef/TxHashMap/etc with Effect.tx; replay-safe body, transactional state only |
| Mailbox / old Queue semantics | Queue carries completion/failure; distinguish Cause.Done from domain failure |
| Cause tree | Flat reasons; preserve failure/defect/interrupt classification |
| Schema.Union(A,B), Literal(a,b) | Union([A,B]), Literals([a,b]); inspect tagged/oneOf semantics |
| Schema.filter/transform/decodeUnknown | check/refinement, decodeTo/SchemaTransformation, decodeUnknownEffect; retest codec laws |
| parseJson / JSONSchema | fromJsonString / JsonSchema; check draft and encoding direction |
| optional fields/defaults | optionalKey vs optional, explicit undefined and decoding defaults |
| Platform, CLI, SQL, RPC, AI family packages | Moved into `effect/*` namespaces (`effect/http`, `effect/cli`, `effect/sql`, `effect/rpc`, `effect/ai`, ...), mostly `@stability unstable`; platform/SQL-driver/provider adapters remain separate `@effect/*` packages |
| CLI Options/Args and earlier v4 constructors | Flag/Argument; 4.0.3 uses String/Boolean/Int/Finite/Literals; Prompt.String/Select/Confirm; verify argv and exit behavior |
| HttpApi builder and endpoint syntax | v4 options/schema APIs; recheck middleware, errors, HEAD, streaming and clients |
| Equality/hash and collection keys | v4 equality semantics differ; test caches/dedup/maps with real key values |

Do not mechanically upgrade every `@effect/*` dependency to one version: inspect
peer requirements, independently versioned tooling and obsolete merged packages.
Use compiler diagnostics to guide edits, not `any`/casts or `orDie` to silence them.

## Effect v4 release candidates to 4.0.x

`4.0.0` (2026-10-01) is the first stable v4; `4.0.x` is LTS. Move the whole
release train together (`effect` and every `@effect/platform-*`, `sql-*`, `ai-*`,
`atom-*`, `vitest`, `opentelemetry` package at the same version); mixed rc/stable
installs fail on the import paths below. Source: `packages/effect/CHANGELOG.md`
sections `4.0.0-rc.116` to `4.0.3` and `MIGRATION.md` ("Unstable Module System").
Changes that break code written for rc.115–rc.117:

| rc code | 4.0.x | Detected by |
|---|---|---|
| `effect/unstable/<m>/...` (rc.118 removed; no compatibility exports) | `effect/<m>/...`, e.g. `effect/http/HttpClient`, `effect/persistence/KeyValueStore`, `effect/cli/Command` | module resolution |
| `effect/unstable/httpapi/*` | `effect/http-api/*` | module resolution |
| `effect/unstable/arbitrary/Arbitrary`, `effect/unstable/schema` | `effect/Arbitrary`; `effect/schema` (`Model`, `VariantSchema`) | module resolution |
| `effect/Encoding` (`Encoding.encodeBase64` etc.) | `effect/encoding/Base64`, `Base64Url`, `Hex`; failures from `effect/encoding/EncodingError` | module resolution |
| `Schema.isLengthBetween`, `isSizeBetween`, `isPropertiesLengthBetween`, `isStartsWith`, `isEndsWith`, `isIncludes` | `isBetweenLength`, `isBetweenSize`, `isBetweenProperties`, `isStartingWith`, `isEndingWith`, `isIncluding` | compiler |
| `SchemaTransformation.make`, `transformation.compose(t)`, `SchemaGetter.onSome/onNone`, `new SchemaGetter.Getter` | `makeTransformation`, `composeTransformation(first, second)`, `transformEffect` / `transformOptionalEffect` | compiler |
| `TestSchema` `verifyLosslessTransformation` | `verifyRoundTrip` (plus `succeedEffect`, `failEffect`, `verifyRoundTripEffect`) | compiler |
| `Effect/Array/Chunk/Record.partition`, `separate`, `Option.partitionMap` returning `[failures, successes]` | `[successes, failures]`; `Stream.partition` returns `[passes, fails]` | **silent when both sides have the same type**; review every destructuring |
| `Effect.orElseSucceed(() => a)` | callback receives the error | compiler only if the arity matters |
| `Scope.close(scope, exit)` on a plain `Scope.Scope` | needs a `Scope.Closeable` from `Scope.make`/`Scope.fork` | compiler |
| `Schema.brand` with several identifiers / brand read from AST annotations | one identifier per `brand` call (apply repeatedly); brands are type-only | compiler / representation tests |
| `crypto.randomUUIDv4` / `randomUUIDv7` as values | call them: `randomUUIDv4()`, optional `{ format: "bytes" }` (4.0.3) | compiler |
| `Queue.shutdown` result ignored as `true`; `Queue.State.takers` entries called as functions | returns `false` if already done; call `entry.resume(...)` | compiler / tests |
| `ByteSize.Input` from arbitrary strings | only canonical literals; parse others with `ByteSize.fromString` | compiler |
| `Effect.repeat({ times/schedule, until: refinement })` narrowing | result keeps the source type | compiler |
| `Config.withDefault`/`option` around a partly present `Config.all` group | group default now replaces the whole group | tests |
| AI telemetry `system` option, `WellKnownSystem`, `BaseAttributes` (4.0.2) | `provider: { name }`, `ProviderAttributes`, `WellKnownProviderName` | compiler |
| `@effect/vitest` `it.effect.each` | receives the test context as second argument | compiler |

From rc.112 or earlier, first apply rc.113's renames: `Config.string/number/...`
to PascalCase `Config.String/Number/...` and `Config.mapOrFail` to `Config.mapEffect`;
PascalCase CLI constructors (`Flag.String`, `Argument.Int`, `Prompt.String`);
`SchemaGetter/SchemaTransformation.transformOrFail` to `transformEffect`;
`Channel.runDone` to `Channel.runDrain`; MessagePack serialization removed (use
SchemaBinary or NDJSON); `Reactivity`, `LanguageModel`, `EmbeddingModel`, `Chat`
referenced by their same-name types instead of `.Service`; `@effect/sql-pg` now uses
a native client instead of `pg`.

Behavior and wire changes to review even when everything compiles:

- HttpApi runtime TypeIds and service keys moved from `effect/httpapi/*` to
  `effect/http-api/*`, and the reserved SSE stream-failure event is now
  `effect/http-api/stream/failure`. A client and server on different sides of
  the rename do not recognize each other's stream failures; deploy them together
  or keep both on one version.
- Persisted Schema check IDs (`SchemaRepresentation` documents) use the renamed
  check names; regenerate or migrate stored representations.
- Workflow execution IDs are now derived from a length-prefixed tag plus
  idempotency key (rc.118), so in-flight durable workflows started on an rc do not
  resume under the same ID. Drain them before upgrading.
- `Hash` values and `HashRing` shard assignments may change; do not persist them
  across the upgrade.
- `Effect.race*` now interrupt losers that are still starting; `Effect.cached*`,
  `Cache`, `RcRef`/`RcMap` treat caller interruption as abandonment (4.0.1);
  `Scope.close` finalizers run uninterruptibly; CLI prompts end on Esc by default.

Mechanical first pass (GNU sed shown), then fix compiler errors and review the partition sites:

```sh
rg -l 'effect/unstable/' --glob '*.{ts,tsx,mts,cts}' . | xargs sed -i -E \
  -e 's#effect/unstable/httpapi#effect/http-api#g' \
  -e 's#effect/unstable/arbitrary/Arbitrary#effect/Arbitrary#g' \
  -e 's#effect/unstable/#effect/#g'
rg -n '"effect/arbitrary"|effect/Encoding|\bpartition\(|\bseparate\(|partitionMap' --glob '*.{ts,tsx}' .
```

The last pass turns the removed barrel into a nonexistent `"effect/arbitrary"`:
`import { Arbitrary } from "effect/unstable/arbitrary"` becomes
`import * as Arbitrary from "effect/Arbitrary"` (or `import { Arbitrary } from "effect"`).
Pin `effect@4.0.x` explicitly: the `rc` dist-tag still points at a release candidate.

## Correctness evidence and limits

Typechecking establishes static compatibility under TypeScript's assumptions;
Schema tests establish specific boundary rules; property tests establish tested
laws over generated samples; differential/host tests compare observed behavior.
None proves arbitrary program equivalence or remote exactly-once execution.

For concurrency, use barriers/Deferred and assert order/counts/release rather
than sleeping real time. For mutation/durability, inject failures around remote
success, local commit/journal and acknowledgement; assert duplicate protection
and reconciliation. For a formal requirement, state the transition-system model,
invariants, environment assumptions and proof/model-checking result separately.

Deliver the changed code, green relevant checks, remaining seams, deliberate
behavior changes, compatibility/migration notes and concrete unverified risks.
Do not claim a complete migration while the agreed scope still has unexplained
parallel Promise/runtime/error/retry machinery.
