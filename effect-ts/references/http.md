# HTTP servers, typed APIs, clients, RPC

Imports: `effect/unstable/httpapi` (HttpApi, HttpApiGroup, HttpApiEndpoint,
HttpApiSchema, HttpApiError, HttpApiMiddleware, HttpApiSecurity, HttpApiBuilder,
HttpApiClient, HttpApiTest, HttpApiScalar, HttpApiSwagger, OpenApi),
`effect/unstable/http` (HttpRouter, HttpServer, HttpServerRequest,
HttpServerResponse, HttpMiddleware, HttpEffect, HttpStaticServer, HttpClient,
HttpClientRequest, HttpClientResponse, FetchHttpClient), `effect/unstable/rpc`,
`@effect/platform-bun` (BunHttpServer, BunHttpClient = FetchHttpClient).

## HttpApi (schema-first; preferred for any JSON API)

Keep the definition in its own file (shared with clients); handlers separate.

```ts
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { id: UserId }, { httpApiStatus: 404 }) {}

class UsersGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/", { query: { search: Schema.optional(Schema.String) }, success: Schema.Array(User.json) }),
    HttpApiEndpoint.get("getById", "/:id", { params: { id: UserId }, success: User.json, error: UserNotFound }),
    HttpApiEndpoint.post("create", "/", { payload: User.jsonCreate, success: User.json }),        // payload must be a Schema for body methods
    HttpApiEndpoint.patch("update", "/:id", { params: { id: UserId }, payload: User.jsonUpdate, success: User.json, error: UserNotFound }),
    HttpApiEndpoint.delete("remove", "/:id", { params: { id: UserId } })                           // default success = NoContent (204)
  )
  .middleware(Authorization)
  .prefix("/users")
  .annotateMerge(OpenApi.annotations({ title: "Users" }))
{}

class SystemGroup extends HttpApiGroup.make("system", { topLevel: true })
  .add(HttpApiEndpoint.get("health", "/health", { success: HttpApiSchema.NoContent })) {}

class Api extends HttpApi.make("my-api").add(UsersGroup).add(SystemGroup)
  .annotateMerge(OpenApi.annotations({ title: "My API", version: "1.0.0" })) {}
```

- Verbs: `get, post, put, patch, delete, head, options`. Options object only:
  `{ params, query, headers, payload, success, error, disableCodecs }`.
- `params/query/headers` take a fields object or schema; values are decoded
  from strings automatically. GET `payload` maps to the query string.
- `success`/`error` accept one schema or an array (multiple statuses or content
  types). Status from `{ httpApiStatus }` annotation on the error class,
  `HttpApiSchema.status(404)`, or `HttpApiSchema.Created/Accepted/Empty(code)`.
- Shapes: `HttpApiSchema.asText({ contentType })`, `asUint8Array`, `asMultipart()`,
  `asMultipartStream()`, `asFormUrlEncoded`, `asNoContent({ decode })`,
  `StreamSse({ data })`, `StreamUint8Array()`, `WithHeaders(body, headers)`.
- Built-in errors: `HttpApiError.NotFound/BadRequest/Unauthorized/Forbidden/Conflict/UnprocessableEntity/...`
  and `*NoContent` schema variants. Schema decode failures become 400 `HttpApiSchemaError`.

### Handlers and wiring

```ts
const UsersHandlers = HttpApiBuilder.group(Api, "users", Effect.fn(function*(handlers) {
  const users = yield* Users
  return handlers.handleAll({
    list: ({ query }) => users.list(query.search).pipe(Effect.orDie),
    getById: ({ params }) => users.getById(params.id),               // error type must match the endpoint's error schema
    create: ({ payload }) => users.create(payload).pipe(Effect.orDie),
    update: ({ params, payload }) => users.update(params.id, payload),
    remove: ({ params }) => users.remove(params.id)
  })
}))
// handlers.handle("name", fn) one at a time; handlers.handleRaw for the raw request; handler may return HttpServerResponse directly.

const ApiLayer = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide([UsersHandlers, SystemHandlers]),
  Layer.provide([Users.layer, AuthorizationLayer])
)
const Routes = Layer.mergeAll(ApiLayer, HttpApiScalar.layer(Api, { path: "/docs" }), HttpRouter.cors({ allowedOrigins: ["*"] }))
const Server = HttpRouter.serve(Routes, { disableLogger: false }).pipe(Layer.provide(BunHttpServer.layer({ port: 3000 })))
BunRuntime.runMain(Layer.launch(Server))

// Serverless / Bun.serve fetch handler instead of a listening server:
const { handler, dispose } = HttpRouter.toWebHandler(Routes.pipe(Layer.provide(HttpServer.layerServices)))
```

`BunHttpServer.layer(options)` accepts Bun serve options (`port`, `hostname`,
`unix`, `websocket`) plus `gracefulShutdownTimeout`. `layerConfig` reads from
`Config`; `layerTest` binds an ephemeral port and provides an `HttpClient`.
Domain errors unrelated to the endpoint contract: `Effect.orDie` (500) or map
with `Effect.catchReasons("UsersError", { UserNotFound: Effect.fail }, Effect.die)`.

### Middleware and security

```ts
class CurrentUser extends Context.Service<CurrentUser, User>()("app/CurrentUser") {}
class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", { message: Schema.String }, { httpApiStatus: 401 }) {}

class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentUser; requires: never }>()(
  "app/Authorization",
  { requiredForClient: true, security: { bearer: HttpApiSecurity.bearer }, error: Unauthorized }
) {}
// HttpApiSecurity.bearer | basic | apiKey({ key, in: "header" | "query" | "cookie" }) | http({ scheme })

const AuthorizationLayer = Layer.effect(Authorization, Effect.gen(function*() {
  const sessions = yield* Sessions
  return Authorization.of({
    bearer: Effect.fn(function*(httpEffect, { credential }) {       // one key per security scheme
      const user = yield* sessions.verify(Redacted.value(credential)).pipe(Effect.mapError(() => new Unauthorized({ message: "invalid token" })))
      return yield* Effect.provideService(httpEffect, CurrentUser, user)
    })
  })
}))
// Plain middleware (no security): implementation is (httpEffect, { endpoint, group }) => Effect<HttpServerResponse>
// Attach: group.middleware(Authorization) or endpoint.middleware(Authorization); Api.middleware for all groups.
// Client side (requiredForClient): HttpApiMiddleware.layerClient(Authorization, ({ next, request }) => next(HttpClientRequest.bearerToken(request, token)))
```

Cross-cutting: `HttpRouter.middleware(fn).layer` (route-scoped, provide onto
routes) or `HttpRouter.middleware(fn, { global: true })`; `HttpMiddleware.logger`,
`tracer` (on by default in `serve`), `cors`, `compression`, `xForwardedHeaders`;
`HttpRouter.disableLogger` per route; `HttpMiddleware.layerTracerDisabledForUrls(["/health"])`.

### Typed client

```ts
class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()("app/ApiClient") {
  static readonly layer = Layer.effect(ApiClient, HttpApiClient.make(Api, {
    baseUrl: "http://localhost:3000",
    transformClient: (c) => c.pipe(HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 }))
  })).pipe(Layer.provide(AuthorizationClient), Layer.provide(FetchHttpClient.layer))
}
const client = yield* ApiClient
const user = yield* client.users.getById({ params: { id } })        // typed error channel: UserNotFound | HttpClientError | ...
yield* client.health()                                              // topLevel group
```

`HttpApiClient.group`/`endpoint` build partial clients; `urlBuilder` builds URLs
only; `OpenApi.fromApi(Api)` returns the spec object.

### In-memory tests

```ts
const makeClient = HttpApiTest.groups(Api, ["users"])
const client = yield* makeClient   // provide handlers + HttpServer.layerServices + client middleware layers
```

## HttpRouter (low level, non-JSON, static files, websockets)

```ts
const Routes = Layer.mergeAll(
  HttpRouter.add("GET", "/hello", HttpServerResponse.text("hi")),
  HttpRouter.add("POST", "/echo", Effect.gen(function*() {
    const body = yield* HttpServerRequest.schemaBodyJson(Echo)
    return yield* HttpServerResponse.json(body)          // json/schemaJson return Effects (encode can fail); jsonUnsafe is sync
  })),
  HttpRouter.add("GET", "/users/:id", Effect.gen(function*() {
    const { id } = yield* HttpRouter.params
    return yield* HttpServerResponse.schemaJson(User)(yield* users.get(id))
  })),
  HttpRouter.add("GET", "/ws", Effect.gen(function*() {
    const socket = yield* (yield* HttpServerRequest.HttpServerRequest).upgrade
    ...
  })),
  HttpStaticServer.layer({ root: "./public", prefix: "/static", spa: true })
)
```

Responses: `HttpServerResponse.json/jsonUnsafe/schemaJson(S)/text/html/htmlStream/stream/file/formData/redirect/empty`,
mutators `setStatus/setHeader/setHeaders/setCookie/setBody`. Requests:
`HttpServerRequest.schemaBodyJson/schemaBodyForm/schemaBodyMultipart/schemaHeaders/schemaSearchParams/schemaCookies`,
`request.multipart`, `request.multipartStream`, `request.upgrade`.
`HttpRouter.use(Effect.fn(function*(router) { yield* router.add(...) }))` for imperative registration.

## HttpClient

```ts
const client = (yield* HttpClient.HttpClient).pipe(
  HttpClient.mapRequest(flow(HttpClientRequest.prependUrl(baseUrl), HttpClientRequest.acceptJson, HttpClientRequest.bearerToken(token))),
  HttpClient.filterStatusOk,
  HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 })
)
const todos = yield* client.get("/todos", { urlParams: { page: 1 } }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Todo))))
const created = yield* HttpClientRequest.post("/todos").pipe(HttpClientRequest.schemaBodyJson(NewTodo)(input), Effect.flatMap(client.execute), Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)))
yield* client.get("/big").pipe(HttpClientResponse.stream, Stream.run(fs.sink("out.bin")))
res.pipe(HttpClientResponse.matchStatus({ 404: () => ..., "2xx": ..., orElse: ... }))
```

Timeouts: `Effect.timeout("10 seconds")` on the call. Cookies: `HttpClient.withCookiesRef`.
`HttpClient.withScope` for streaming bodies. Layer: `FetchHttpClient.layer`
(Bun's `fetch`). Override `FetchHttpClient.Fetch` reference in tests, or
`HttpClient.make((request) => ...)` for a stub. Wrap clients in a
`Context.Service` and map `HttpClientError | SchemaError` to a domain error.

## RPC (typed procedures over HTTP, WebSocket, stdio, workers)

```ts
const GetUser = Rpc.make("GetUser", { payload: { id: Schema.String }, success: User, error: UserNotFound })
const Ticks = Rpc.make("Ticks", { success: Schema.Number, stream: true })
class UserRpcs extends RpcGroup.make(GetUser, Ticks) {}
const UserRpcsLive = UserRpcs.toLayer({ GetUser: ({ id }) => users.get(id), Ticks: () => Stream.tick("1 second").pipe(Stream.scan(0, (n) => n + 1)) })

const RpcRoutes = RpcServer.layerHttp({ group: UserRpcs, path: "/rpc", protocol: "http" })   // default websocket
  .pipe(Layer.provide(UserRpcsLive), Layer.provide(RpcSerialization.layerNdjson))

const client = yield* RpcClient.make(UserRpcs).pipe(
  Effect.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:3000/rpc" })),
  Effect.provide(RpcSerialization.layerNdjson), Effect.provide(FetchHttpClient.layer))
const user = yield* client.GetUser({ id })
```

Serialization: `layerNdjson`/`layerNdJsonRpc` for byte streams (HTTP body,
stdio), `layerJson`/`layerMsgPack` when the transport frames messages
(WebSocket). `RpcServer.layerProtocolStdio` turns a CLI into an RPC server for
agent tooling; `RpcMiddleware.Service` mirrors HttpApiMiddleware;
`RpcTest.makeClient(group)` for in-memory tests; `Rpc.fork` on a handler
lets it run concurrently with others on the same connection.

## Existing framework (Hono, Bun.serve)

Bridge with `ManagedRuntime.make(AppLayer, { memoMap: Layer.makeMemoMapUnsafe() })`
and `runtime.runPromise(Service.use((s) => s.method(...)))` per request;
`runtime.dispose()` on SIGINT/SIGTERM. Decode bodies with
`Schema.decodeUnknownSync` at the edge. Move to `HttpApi` when the handlers
are all Effects.
