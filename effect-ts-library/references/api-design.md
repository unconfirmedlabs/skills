# API design for library consumers

## Two tiers when wrapping an SDK

A wrapper that only offers an opinionated surface strands consumers the moment
they need one field it dropped; a wrapper that only mirrors the SDK adds no
opinion. Ship both, as separate services with the same error taxonomy:

- **Mechanical tier** (`FooCore`): one-to-one with the upstream interface.
  Every upstream method, every generic preserved (including conditional
  "include"-style generics), the AbortSignal from `Effect.tryPromise` forwarded
  into the SDK's cancellation option, one `mapSdkError`, a span per method,
  read retries on transient transport errors only, writes never retried here.
  A `use(f: (client, signal) => Promise<A>): Effect<A, FooError>` escape hatch
  that still runs the error mapper.
- **Opinionated tier** (`Foo`): built on the core service, fixed option sets,
  Schema-decoded results, `Option` for absence, streams for pagination, the
  locks and invariants the domain needs. Consumers drop one tier when they need
  more, never to Promise land.

Name the mechanical tier after the upstream's own name for the seam (the Sui
SDK calls it the Core API, hence `SuiCore`). Avoid names that collide with
upstream exports or with removed upstream classes that training data remembers.

The completeness test that keeps the mechanical tier honest:

```ts
type Missing = Exclude<keyof UpstreamMethods, keyof FooCore["Service"]>
const _complete: Missing extends never ? true : Missing = true
```

## Services

```ts
export class Foo extends Context.Service<Foo, {
  readonly network: Network
  getThing(id: ThingId, opts?: { schema?: Schema.Codec<S, Uint8Array> }): Effect<Thing<S>, ThingNotFound | DecodeError | TransportError>
  streamThings(owner: Address): Stream<Thing, TransportError>
}>()("my-lib/Foo") {
  static readonly layerNoDeps: Layer<Foo, StartupError, FooCore> = Layer.effect(Foo, make)
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(FooCore.layerDefault))
  static readonly layerConfig = Layer.unwrap(Effect.gen(function*() { ... }))
}
```

- Identifiers are `"<package>/<Name>"`; the string is the runtime key across
  every copy of the module, so never rename it after publishing.
- `layerNoDeps` requires the dependencies; `layer` provides defaults;
  `layerConfig` reads `Config`. Tests provide `layerNoDeps` over a fake.
- Startup work that can fail (a network identity check) belongs in the layer
  with a typed error, so a misconfigured consumer fails at build, not on the
  first call.
- Per-key coordination the library owns (a lock per account, a cache per
  endpoint) lives in the layer's state. Make eviction explicit or document
  that the map is bounded by the key space.

## `Effect.fn` and overloads

Every member is `Effect.fn("Foo.method")`: span, stack trace, and generics
still flow (`Effect.fn("f")(function*<S>(id, opts: { schema: Codec<S> }) {...})`
keeps `S` in rc.112). The one thing `Effect.fn` cannot express is an overload
set. When a parameter's presence changes the result type (schema given means
decoded content, absent means raw bytes), declare the overloads in the service
interface by hand and keep the implementation as `Effect.fn`. Say so in a
comment, because a reader will otherwise "fix" it back.

Never return `Effect.gen(...)` from a plain arrow in a library; it is the
one pattern the language-service plugin flags most and it loses the span.

## Errors

- One flat set of `Schema.TaggedError` classes, exported together with a
  union type and helpers consumers otherwise hand-roll:
  `isRetryable(e)`, an outcome classifier where mutations can be ambiguous
  (`"applied" | "not_applied" | "unknown"`), `describe(e)` for one actionable
  line, `toJson(e)`.
- Fields are what a caller needs to act on (ids, expected vs actual, the
  digest), never a bare message. Wrap unknown thrown values as
  `cause: Schema.Defect()`.
- Use a nested `reason` union (`Effect.catchReason`) only where the upstream
  itself has a structured union (an execution status with ten variants);
  elsewhere flat tags read better in signatures.
- Mirror upstream discriminators when you mirror upstream shapes:
  `Schema.Union([...]).pipe(Schema.toTaggedUnion("$kind"))` keeps `.match`
  and `.guards` while decoding the wire shape with zero conversion.
- Widen retry classification from how the transport actually reports
  failures, not from the status names alone. A rejected `fetch` and an HTTP
  500 often surface as `INTERNAL` or `UNKNOWN`, not `UNAVAILABLE`; read the
  transport's source and document the exact list.
- Timeouts from `Effect.timeout` are `Cause.TimeoutError`, outside your
  taxonomy. Either map them at the boundary where you apply the timeout, or
  make every classifier and exit-code mapper handle them explicitly.

## Schemas and codecs

- Branded primitives (`Address`, `ObjectId`, `Digest`) normalize on decode via
  `SchemaGetter.transform` and reject malformed input; `X.make` at call sites.
- Bytes that reach any JSON boundary (errors, journals, logs) use
  `Schema.Uint8ArrayFromBase64`, never `Schema.Uint8Array`, or `toJson` yields
  `{"0":1,"1":2}`.
- A binary codec bridge (`SuiSchema.bcs(codec, expectedType)`) returns a
  `Schema.Codec<T, Uint8Array>`; store metadata such as the expected type as an
  annotation and make lookups walk the AST encoding chain so the annotation
  survives `pipe(Schema.decodeTo(DomainClass, ...))`. Add a round-trip length
  check when the upstream parser ignores trailing bytes.
- Accept any structural codec (`{ parse(bytes): T }`) where consumers have
  generated ones; do not require your own wrapper type.
- Accessors over upstream result shapes (created objects of a type, balance
  deltas) belong on a `Schema.Class` result value with methods, not as loose
  functions, and must not fabricate fields the upstream did not return; type
  the missing ones as optional.

## Named error unions for multi-step operations

Export a named union for every multi-step operation's error set (`RunError`,
`SubmitError`). Consumers that wrap the operation otherwise repeat a dozen
tags by hand and go stale the first time the taxonomy grows.

## Streams, pagination, concurrency

- Every paginated upstream method becomes `Stream.paginate(cursor, step)`; the
  step returns `[items, Option<nextCursor>]`.
- Batch reads chunk to the upstream limit and verify the response (no
  missing or unexpected ids); dedupe the request instead of failing on
  duplicates.
- Never cache versioned upstream state inside the library; a stale reference
  is the consumer's hardest bug. Offer `Effect.cachedWithTTL` for values that
  are genuinely slow-moving and say which.
- Where writes must not race per principal (gas coin selection), hold the lock
  across the whole build-sign-submit span, not around the submit alone.

## Lifecycle as functions, journal as data

For multi-step mutations, expose the steps as functions with typed outcomes
(`build`, `sign`, `submit`, `reconcile`, `run`) rather than a state-machine
object; keep a tagged union only for the persisted record. Configuration for
the steps is a `Context.Reference` with defaults so it stays out of `R`;
the durable record store is likewise a `Context.Reference` with an in-memory
default and an optional durable layer behind a subpath.
