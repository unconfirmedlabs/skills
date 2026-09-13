# SQL and persistence

Requires: [services](services.md), [Schema](schema.md), [resilience](resilience.md).

## SQL

Use `effect/unstable/sql/SqlClient` for parameterized statements and transactions,
`SqlSchema` for validated request/result boundaries, `SqlResolver` for batched
lookups, `SqlModel` plus `effect/unstable/schema/Model` for schema-derived CRUD,
and driver Migrator modules for ordered startup/schema changes.

A `sql<Row>` generic is a static assertion, not runtime row decoding. Validate
external rows with SqlSchema/Schema where the contract requires it. Interpolate
values through tagged statements, whitelist dynamic identifiers and keep
`unsafe` SQL restricted to trusted text/parameter pairs. SQL injection protection
does not supply authorization, tenant filters or transaction isolation.

Choose the adapter for the actual database/runtime: pg, mysql2, mssql, clickhouse,
libsql, pglite, D1, or the Bun/Node/DO/React Native/WASM SQLite adapters. Driver
streaming, transaction, cancellation, update and result-shape support differ.
Read each driver's header and tests before composing a generic SqlClient service.

| Host/driver case | Constraint |
|---|---|
| Typical connection-based SQL driver | `withTransaction` owns a scoped connection; check nested savepoint and interruption behavior for that driver |
| Cloudflare D1 | `D1Client.batch` supports a fixed atomic batch; no SqlClient `withTransaction`, query streaming or `updateValues` in rc.115 |
| Durable Object SQLite | Pass full `{ storage: this.ctx.storage }` for transaction/migration support; `{ db: storage.sql }` only supports ordinary queries; nested transactions rejected |
| SQLite Bun | Do not assume a query stream exists because another SqlClient driver provides one |

Wrap a driver behind a domain service when it helps error semantics and testing.
Keep missing rows (`Option` or NotFound), invalid stored data and database failure
separate. Transient SqlError is not automatically a defect. Preserve the public
error union or map it deliberately; never use `orDie` just to close the signature.

Model variants can separate select/insert/update/JSON shapes, generated fields,
redacted/sensitive fields, dates and schema-specific storage formats. Test actual
insert/update encoding and returned row decoding. Renaming a field/default or
changing a date representation is a migration, even when TypeScript compiles.

## Key-value and durable stores

`KeyValueStore` provides a portable get/set/remove abstraction and schema stores.
Choose memory for ephemeral/test state, filesystem/browser storage for appropriate
local use, and SQL/Redis/custom adapters for shared/persistent state.

`KeyValueStore.makeStringOnly` constructs a service from string primitives and
adapts bytes using base64; it does not reject all Uint8Array values. Wrap the value
with `Layer.succeed` if a Layer is needed. `KeyValueStoreError` is constructed
with method/message/cause and optional key; there is no `fromUnknown` helper in
rc.115. A custom backend must specify list/size/delete semantics honestly.

`Persistable` combines payload identity and result codecs. `Persistence` stores
schema-encoded results. `PersistedCache` adds a persistent cache; state freshness,
capacity, failure TTL and invalidation remain application policy. Persistent does
not mean tenant-safe or consistent with a concurrent writer automatically.

`PersistedQueue.make({ name, schema, maxAttempts })` creates a queue;
`queue.offer(value, { id })` supplies deduplication identity, and `queue.take(handler)`
processes a delivery. Delivery is **at least once**, even with an offer id. Durable
mutations must be idempotent or reconciled across crashes/lease expiry. A memory
store only exercises API behavior; use a durable store for restart guarantees.

`RateLimiter` with memory/Redis store supports shared admission policy at the
store's scope. Specify fail vs delay, partition keys, storage outage policy and
per-operation cost. `Redis` integration and persisted queue/cache backend layers
are available; search the source inventory for exact constructors.

## Verification

Use a real local instance of the selected database where driver semantics matter;
an in-memory fake does not prove SQL dialect, isolation, constraints or recovery.
Test codecs, constraints, rollback on failure/cancellation, competing writes,
connection release, schema upgrade compatibility and idempotent redelivery.
A full-document KV write does not prove atomicity with a remote side effect.

Source: `packages/effect/src/unstable/{sql,schema,persistence}` and driver source
under `packages/sql/`, linked through [coverage](source-and-coverage.md).
