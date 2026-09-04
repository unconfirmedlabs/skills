// HTTP API entrypoint: schema-first endpoints, OpenAPI docs, Bun server.
// Run: bun run api.ts  →  http://localhost:3000/docs
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiScalar, HttpApiSchema } from "effect/unstable/httpapi"

// --- Domain ------------------------------------------------------------------
const TodoId = Schema.Int.pipe(Schema.brand("TodoId"))
type TodoId = typeof TodoId.Type

class Todo extends Schema.Class<Todo>("Todo")({
  id: TodoId,
  title: Schema.NonEmptyString,
  done: Schema.Boolean
}) {}

class TodoNotFound extends Schema.TaggedError<TodoNotFound>()("TodoNotFound", { id: TodoId }, { httpApiStatus: 404 }) {}

// --- API definition (share this file between server and clients) -----------
class TodosGroup extends HttpApiGroup.make("todos")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Todo) }),
    HttpApiEndpoint.get("get", "/:id", { params: { id: TodoId }, success: Todo, error: TodoNotFound }),
    HttpApiEndpoint.post("create", "/", { payload: Schema.Struct({ title: Schema.NonEmptyString }), success: Todo })
  )
  .prefix("/todos")
{}

class SystemGroup extends HttpApiGroup.make("system", { topLevel: true })
  .add(HttpApiEndpoint.get("health", "/health", { success: HttpApiSchema.NoContent }))
{}

class Api extends HttpApi.make("todo-api").add(TodosGroup).add(SystemGroup) {}

// --- Service -------------------------------------------------------------------
class Todos extends Context.Service<Todos, {
  readonly list: Effect.Effect<ReadonlyArray<Todo>>
  get(id: TodoId): Effect.Effect<Todo, TodoNotFound>
  create(title: string): Effect.Effect<Todo>
}>()("app/Todos") {
  static readonly layer = Layer.effect(
    Todos,
    Effect.gen(function*() {
      const store = yield* Ref.make(new Map<TodoId, Todo>())
      const nextId = yield* Ref.make(1)
      return Todos.of({
        list: Ref.get(store).pipe(Effect.map((m) => [...m.values()])),
        get: Effect.fn("Todos.get")(function*(id: TodoId) {
          const todo = (yield* Ref.get(store)).get(id)
          return todo ?? (yield* new TodoNotFound({ id }))
        }),
        create: Effect.fn("Todos.create")(function*(title: string) {
          const id = TodoId.make(yield* Ref.getAndUpdate(nextId, (n) => n + 1))
          const todo = new Todo({ id, title, done: false })
          yield* Ref.update(store, (m) => new Map(m).set(id, todo))
          return todo
        })
      })
    })
  )
}

// --- Handlers ------------------------------------------------------------------
const TodosHandlers = HttpApiBuilder.group(Api, "todos", Effect.fn(function*(handlers) {
  const todos = yield* Todos
  return handlers.handleAll({
    list: () => todos.list,
    get: ({ params }) => todos.get(params.id),
    create: ({ payload }) => todos.create(payload.title)
  })
}))

const SystemHandlers = HttpApiBuilder.group(Api, "system", Effect.fn(function*(handlers) {
  return handlers.handleAll({ health: () => Effect.void })
}))

// --- Wiring ------------------------------------------------------------------
const ApiLayer = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide([TodosHandlers, SystemHandlers]),
  Layer.provide(Todos.layer)
)

const Routes = Layer.mergeAll(ApiLayer, HttpApiScalar.layer(Api, { path: "/docs" }))

const Server = HttpRouter.serve(Routes).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

BunRuntime.runMain(Layer.launch(Server))
