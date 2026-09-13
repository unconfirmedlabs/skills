# Reactivity, browser applications and transport integrations

Requires: [services](services.md), [state/concurrency](state-and-concurrency.md),
[streams](streams.md). Add [HTTP](http.md) for typed clients.

## Reactive state

`effect/unstable/reactivity/Atom` describes values, derived values, effect-backed
queries, streams and writable state. `AtomRegistry` owns cached values, dependency
tracking, running effects and cleanup. Use `AsyncResult` for initial/loading/
success/failure/refresh state, `AtomRef` for observable references, and
`AtomHttpApi`/`AtomRpc` for typed query/mutation integration.

Use framework adapters `@effect/atom-react`, `atom-solid`, `atom-vue` for lifecycle
and subscriptions. Keep pure UI derivations in atoms or ordinary functions;
perform side effects in owned Effect operations. Define refresh/invalidation,
optimistic update/rollback, cancellation, stale values and error rendering.
A subscription is a resource; unmount/registry disposal should release it.

`Reactivity` invalidates process-local keys; it is not itself a durable cache or
cross-process event bus. `AtomRegistry` owns actual cached reactive state. Scope
registry and runtime to the application's lifetime and user/session isolation.
Server-rendered requests must not share one mutable registry containing user data.

`Hydration` works with serializable atoms (`Atom.serializable`): test server/client
encoded state, schema compatibility and which values may be exposed. Do not
serialize credentials or live services into a hydration payload. Use browser
storage adapters only when persistence/security semantics fit the application.

## Sockets and networking

`effect/unstable/socket` provides scoped socket construction and reader/writer
operations, WebSocket adapters and socket-server capabilities. In rc.115 even a
clean close is represented through SocketError; classify close reasons rather
than treating every close as a defect. Retry around a scoped connection/consume
loop, and decide which messages can replay after reconnection. Do not use old
callback `run` APIs from v3 examples without checking current declarations.

Use Channel/Stream framing for protocols, explicit backpressure and limits for
messages, and typed schemas for decoded payloads. Test half-close, reconnect,
malformed frames, early consumer cancellation and pending writes at shutdown.
HTTP upgrades/Cloudflare WebSocket hibernation still follow the host's lifecycle.

`effect/unstable/net/{NetAddress,IpInterface,IpNetwork}` models/parses addresses and
subnets. Use for typed network configuration, containment and routing decisions;
validation alone does not protect against DNS rebinding or supply a connection.

## Local worker transports

`effect/unstable/workers` and platform worker adapters provide background worker
management, runners, pools, typed messages and transferable values. Use for CPU
isolation or existing worker protocols. Choose worker count, request queue limits,
serialization, cancellation and shutdown. A transfer can detach an ArrayBuffer;
never continue using it as though ownership remained with the sender.

These workers are distinct from Cloudflare Workers, queue consumers and cluster
runners. For typed remote procedures compose Rpc with the chosen transport;
verify streaming/cancellation semantics rather than inventing a parallel wire API.

## Other integration seams

FileSystem/Path/Terminal/Stdio and ChildProcess need actual host adapters;
FetchHttpClient needs an appropriate fetch implementation; telemetry exporters
need transport and flush lifetime. ManagedRuntime bridges existing frameworks
without replacing their router. ErrorReporter connects unexpected failure reports
to a chosen reporting service; avoid duplicate logs/reports or secret payloads.

Inspect [the complete inventory](source-and-coverage.md) for new/advanced
integration modules and adapter-specific limits. Test browser DOM/runtime behavior
in a browser and host worker behavior in its worker runtime; Node mocks establish
only the mocked contract.
