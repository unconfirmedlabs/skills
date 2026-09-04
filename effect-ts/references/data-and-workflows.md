# Data, persistence, durable workflows, AI

Imports: `effect/unstable/sql` (SqlClient, SqlSchema, SqlResolver, SqlModel,
Migrator, SqlError), `effect/unstable/schema` (Model), driver packages
(`@effect/sql-sqlite-bun`, `@effect/sql-pg`, ...), `effect/unstable/persistence`
(KeyValueStore, Persistence, PersistedCache, PersistedQueue, RateLimiter, Redis),
`effect/unstable/workflow` (Workflow, Activity, DurableClock, DurableDeferred,
DurableQueue, WorkflowEngine, WorkflowProxy), `effect/unstable/ai`
(LanguageModel, Chat, Prompt, Tool, Toolkit, Model, AiError), `@effect/ai-anthropic`.

## SQL

```ts
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"     // PgClient from @effect/sql-pg has the same shape
const SqlLayer = SqliteClient.layer({ filename: "app.db" })                // or SqliteClient.layerConfig({ filename: Config.string("DB_FILE") }); PgClient.layerConfig({ url: Config.redacted("DATABASE_URL") })
const MigratorLayer = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({
    "0001_create_users": Effect.gen(function*() { const sql = yield* SqlClient.SqlClient; yield* sql`CREATE TABLE users (...)` })
  })                                                                      // or fromFileSystem("./migrations") with files <id>_<name>.ts exporting an Effect
})
const SqlLive = MigratorLayer.pipe(Layer.provideMerge(SqlLayer))           // anything built on SqlLive sees a migrated database
```

Queries (the `sql` value is the `SqlClient` service and a tagged template):

```ts
const sql = yield* SqlClient.SqlClient
const rows = yield* sql<{ id: string; name: string }>`SELECT * FROM users WHERE id = ${id}`      // Statement is an Effect<ReadonlyArray<Row>, SqlError>
yield* sql`INSERT INTO users ${sql.insert({ id, name })}`
yield* sql`UPDATE users SET ${sql.update({ id, name }, ["id"])} WHERE id = ${id}`
yield* sql`SELECT * FROM users WHERE ${sql.in("id", ids)} AND ${sql.and([sql`active = 1`, sql`role = ${role}`])}`
yield* sql.unsafe<Row>("SELECT ... WHERE id = ?", [id])
sql`SELECT ...`.stream                                    // Stream<Row, SqlError> (not on sqlite-bun)
yield* sql.withTransaction(Effect.gen(function*() { ... }))   // nested calls become savepoints; rollback on failure or interrupt
sql.onDialect({ sqlite: () => ..., pg: () => ..., mysql: ..., mssql: ..., clickhouse: ... })
```

Typed queries and batching:

```ts
const findByEmail = SqlSchema.findOneOption({ Request: Schema.String, Result: User, execute: (email) => sql`SELECT * FROM users WHERE email = ${email}` })
const listAll = SqlSchema.findAll({ Request: Schema.Void, Result: User, execute: () => sql`SELECT * FROM users` })
// also findOne (fails NoSuchElementError), findNonEmpty, void
const byId = SqlResolver.findById({ Id: UserId, Result: User, ResultId: (u) => u.id, execute: (ids) => sql`SELECT * FROM users WHERE ${sql.in("id", ids)}` })
const getUser = (id: UserId) => SqlResolver.request(id, byId)          // batched + deduped within a tick; SqlResolver.ordered / grouped for other shapes
```

Models and repositories:

```ts
export class User extends Model.Class<User>("User")({
  id: Model.UuidV4Insert(UserId),          // generated on insert; absent from jsonCreate/jsonUpdate
  email: Schema.String,
  passwordHash: Model.Sensitive(Schema.String),          // never in json variants
  settings: Model.JsonFromString(Settings),              // text column, object over HTTP
  active: Model.BooleanSqlite,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate
}) {}
// User (select), User.insert, User.update, User.json, User.jsonCreate, User.jsonUpdate
const repo = yield* SqlModel.makeRepository(User, { tableName: "users", spanPrefix: "Users", idColumn: "id", softDeleteColumn: "deletedAt"? })
const user = yield* User.insert.makeEffect({ email, passwordHash, settings, active: true }).pipe(Effect.flatMap(repo.insert))   // makeEffect fills id + timestamps from the Clock
yield* repo.findById(id)      // NoSuchElementError | SchemaError | SqlError
yield* repo.update(yield* User.update.makeEffect({ id, email }))
yield* repo.delete(id); repo.insertVoid; repo.updateVoid; SqlModel.makeResolvers(User, {...}) for batched variants
```

Wrap the repository in a `Context.Service` that exposes domain errors only:
`Effect.catchTags({ NoSuchElementError: () => new UserNotFound({ id }), SchemaError: Effect.die, SqlError: Effect.die })`.
Keep `layerNoDeps` requiring only `SqlClient` so tests use `SqliteClient.layer({ filename: ":memory:" })`.

## Key-value and persistence

```ts
const kv = yield* KeyValueStore.KeyValueStore                                 // get/set/remove/has/modify/clear/size, string or Uint8Array
const store = KeyValueStore.toSchemaStore(KeyValueStore.prefix(kv, "session:"), SessionState)   // typed Option<T> get/set
// layers: KeyValueStore.layerMemory | layerFileSystem(dir) | layerSql({ table }) | layerStorage(() => localStorage)

class GetUser extends Persistable.Class<{ payload: { id: string } }>()("GetUser", { primaryKey: ({ id }) => `GetUser:${id}`, success: User }) {}
const cache = yield* PersistedCache.make((req: GetUser) => fetchUser(req.id), { storeId: "users", timeToLive: () => "5 minutes", inMemoryCapacity: 1000 })
yield* cache.get(new GetUser({ id }))                                         // Persistence.layerMemory | layerKvs | layerSql | layerRedis

const queue = yield* PersistedQueue.make({ name: "jobs", schema: Job })       // PersistedQueue.layer + layerStoreMemory | layerStoreSql() | layerStoreRedis()
yield* queue.offer(job, { id: job.id })                                       // same id is not re-added
yield* queue.take((job, { attempts }) => process(job), { maxAttempts: 5 })

const withLimiter = yield* RateLimiter.makeWithRateLimiter                    // RateLimiter.layer + layerStoreMemory | layerStoreRedis()
call.pipe(withLimiter({ key: `tenant:${id}`, limit: 100, window: "1 minute", algorithm: "token-bucket", onExceeded: "delay" }))
```

## Durable workflows (restart-safe state machines)

A workflow is a deterministic function over activities. The engine journals
every activity result and deferred completion, so a crashed or suspended run
resumes from the last step instead of re-executing side effects.

```ts
import { Activity, DurableClock, DurableDeferred, Workflow, WorkflowEngine } from "effect/unstable/workflow"

const OrderWorkflow = Workflow.make("OrderWorkflow", {
  payload: { orderId: Schema.String },
  success: Schema.Struct({ shipmentId: Schema.String }),
  error: PaymentDeclined,
  idempotencyKey: ({ orderId }) => orderId          // same key = same execution; execute() is safe to repeat
})

const OrderWorkflowLayer = OrderWorkflow.toLayer(Effect.fn(function*({ orderId }, executionId) {
  const payments = yield* Payments
  yield* Activity.make({
    name: "chargeCard", error: PaymentDeclined,
    execute: payments.charge(orderId).pipe(Effect.retry({ times: 3 }))      // idempotent per Activity.idempotencyKey
  })
  const approval = DurableDeferred.make("managerApproval", { success: Schema.Boolean })
  yield* Notify.send(orderId, DurableDeferred.tokenFromExecutionId(approval, { workflow: OrderWorkflow, executionId }))
  const approved = yield* DurableDeferred.await(approval)                    // suspends until DurableDeferred.succeed(approval, { token, value }) from a webhook
  if (!approved) return yield* new PaymentDeclined({ orderId })
  yield* DurableClock.sleep({ name: "cooldown", duration: "1 day" })         // durable timer
  const shipmentId = yield* Activity.make({ name: "ship", success: Schema.String, execute: shipping.create(orderId) })
  return { shipmentId }
}))

// run
const result = yield* OrderWorkflow.execute({ orderId })                 // or { discard: true } -> executionId
yield* OrderWorkflow.poll(executionId); yield* OrderWorkflow.resume(executionId); yield* OrderWorkflow.interrupt(executionId)
// engine: WorkflowEngine.layerMemory (dev/tests) or ClusterWorkflowEngine.layer (durable, needs Sharding + SqlMessageStorage)
```

Rules: no side effects outside activities; activity names unique within a
workflow; payloads and results are Schemas (they are persisted); use
`Workflow.withCompensation(effect, undo)` for saga-style rollback;
`DurableQueue.make` + `DurableQueue.worker(queue, handler, { concurrency })`
offload work to a pool and suspend the workflow until done. Expose workflows
over RPC or HTTP with `WorkflowProxy.toRpcGroup([...])` /
`toHttpApiGroup("workflows", [...])` plus `WorkflowProxyServer.layerRpcHandlers` /
`layerHttpApi`. For multi-process durability, `Entity.make` in
`effect/unstable/cluster` models stateful actors with the same Rpc definitions.

## LLM calls

```ts
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { AiError, Chat, LanguageModel, Model, Prompt, Tool, Toolkit } from "effect/unstable/ai"

const AnthropicLayer = AnthropicClient.layerConfig({ apiKey: Config.redacted("ANTHROPIC_API_KEY") }).pipe(Layer.provide(FetchHttpClient.layer))
const model = yield* AnthropicLanguageModel.model("claude-fable-5-1").captureRequirements   // Layer<LanguageModel>; provide per call

const text = yield* LanguageModel.generateText({ prompt: "..." }).pipe(Effect.provide(model))            // .text, .usage, .finishReason, .toolCalls
const obj = yield* LanguageModel.generateObject({ prompt, schema: LaunchPlan, objectName: "launch_plan" }).pipe(Effect.provide(model))   // .value typed and validated
LanguageModel.streamText({ prompt }).pipe(Stream.filter((p): p is Response.TextDeltaPart => p.type === "text-delta"), Stream.map((p) => p.delta), Stream.provide(model))

// tools: schema in, schema out, handlers as a Layer
const Search = Tool.make("Search", { description: "...", parameters: Schema.Struct({ q: Schema.String }), success: Schema.Array(Product), failureMode: "error" })
const Tools = Toolkit.make(Search)
const ToolsLayer = Tools.toLayer(Effect.gen(function*() { const db = yield* Db; return Tools.of({ Search: Effect.fn("Tools.Search")(function*({ q }) { return yield* db.search(q) }) }) }))
const res = yield* LanguageModel.generateText({ prompt, toolkit: yield* Tools, toolChoice: "auto" })   // framework runs handlers and feeds results back

// multi-turn agent loop with durable history
const session = yield* Chat.fromPrompt(Prompt.empty.pipe(Prompt.setSystem("You are ...")))
while (true) { const r = yield* session.generateText({ prompt: [], toolkit }).pipe(Effect.provide(model)); if (r.toolCalls.length === 0) return r.text }
const json = yield* session.exportJson; Chat.fromJson(json)

// provider fallback
ExecutionPlan.make({ provide: AnthropicLanguageModel.model("claude-fable-5-1"), attempts: 2 }, { provide: OpenAiLanguageModel.model("gpt-5.2") })
effect.pipe(Effect.withExecutionPlan(plan))
```

Errors are `AiError` with a `reason` union; map with
`Effect.catchTag("AiError", (e) => new MyError({ reason: e.reason }))`. Structured
output is a Schema, so agent state extracted from a model goes straight into
the state-machine `dispatch` with validation. `McpServer` in the same module
exposes `Toolkit`s as an MCP server over stdio or HTTP for agent runtimes.
