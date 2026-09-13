# Workflows, cluster and event logs

Requires: [SQL and persistence](sql-and-persistence.md),
[state/concurrency](state-and-concurrency.md), [streams](streams.md).

## Durable orchestration

Use `Workflow` for a durable multi-step program with schema payload/results and
an execution identity; `Activity` for journaled side-effect steps;
`DurableClock` for persisted timers; `DurableDeferred` for external completion;
`DurableQueue` for offloaded work; `WorkflowProxy`/server adapters for HTTP/RPC
control. Use ordinary Effect/Schedule for work that only needs process lifetime.

An activity memoizes **completed results**. Suspension, interruption, a crash
between remote success and journaling, or a retry can rerun its body. Place
side-effecting notifications inside activities too; code outside activities can
replay. Use stable operation/idempotency keys at the external system, persist
ambiguous outcomes and reconcile before repeating a mutation. Journaling is not
an exactly-once delivery guarantee.

Use deterministic orchestration decisions and stable activity names across
replay. Payload/result/error schemas are persisted contracts: evolve them with
versioning or migration, retaining compatibility for in-flight runs. Use
`Schema.toCodecJson`/explicit encoding when values include dates/bytes/bigints.

`Workflow.withCompensation` expresses saga recovery; compensation can fail and
cannot undo arbitrary external effects exactly. Record partial outcomes and
retry/reconcile compensation explicitly. Use unique activity identities in loops
and account for changes to loop order or workflow definitions after deployment.

`WorkflowEngine.layerMemory` is for tests/development. A persistent engine, such
as ClusterWorkflowEngine with durable message storage, provides a different
restart contract. Do not describe memory-backed examples as restart-safe.
Cloudflare Workflows and Effect Workflow are distinct engines; bridge explicitly
and decide which engine owns replay, retries and durable step identity.

## Cluster entities and workers

`Entity` defines a stateful RPC-addressed capability; `Sharding` routes addresses
and shard ownership to runners. Runner registration/health, message storage,
runner storage, envelopes/replies, entity proxies and cluster workflow integration
are separate modules. Select them from the inventory when multi-process entity
ownership and durable delivery are actually needed; a local queue needs none.

Define entity identity, serialization, concurrent handler policy, duplicate
message handling and failure recovery. Local locks do not replace a durable
ownership/lease protocol. Test runner loss, retries, duplicate delivery and
storage outages. CPU workers under `effect/unstable/workers` are a different
facility from cluster runners or Cloudflare Workers.

## Event logs

`effect/unstable/eventlog` supplies schema-described events/groups, handlers,
journals, client/server replication, encryption and CRDT helpers. Use it for
replicated event-driven state or offline synchronization when the application's
consistency model fits; ordinary logging is Logger, and durable workflow history
is owned by WorkflowEngine.

Choose journal backend, event identity, ordering, causal/conflict rules and
schema evolution explicitly. Encryption does not solve authorization, key
rotation or tenant partitioning. An event handler that also performs a remote
mutation needs duplicate/replay protection. Test replication conflicts, duplicate
events, reordered delivery, offline resumption and projection rebuilding.

## Evidence for durability

Interrupt/restart at each meaningful crash window: before remote action, after
remote success before journal, after journal before acknowledgement. Assert state,
side-effect count, pending work and recovery, using a persistent test engine.
Document assumptions about remote idempotency, durable store atomicity, leases
and acknowledgement. A finite happy-path test is not proof of crash safety.

Source: pinned `unstable/workflow`, `unstable/cluster`, `unstable/eventlog` modules
and their tests; [source and coverage](source-and-coverage.md).
