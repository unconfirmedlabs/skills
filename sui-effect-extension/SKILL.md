---
name: sui-effect-extension
description: Write, migrate or review a Sui SDK package as a sui-effect extension: an Effect v4 Context.Service built on sui-effect's Sui and Tx services with a derived $extend Promise face. Use when creating a TypeScript SDK for a Move package, converting a package from @misofm/effect or from a hand-written @mysten/sui client extension, or reviewing one. Not for sui-effect itself (see effect-ts-library) and not for applications that only consume extensions.
---

# sui-effect extensions

sui-effect wraps `@mysten/sui` 2.x in Effect v4: `SuiCore` is the mechanical
one-to-one tier, `Sui` the opinionated tier (typed object reads, streams,
chain time, per-sender locks), `Tx` the transaction lifecycle (build, sign,
submit with a journal and reconcile), `Script` the on-demand script preset,
`SuiGraphQL` an optional GraphQL client tag, and `SuiExtension.fromService`
the Promise face. An extension is how a Move package's SDK is shipped on top
of it. The authoritative contract ships inside the package: read
`node_modules/sui-effect/docs/extensions.md` in full before writing code,
then `node_modules/sui-effect/LLMS.md` for every signature and
`node_modules/sui-effect/AGENTS.md` for the library's own rules. Copy
`examples/extension-template/` from the sui-effect repository as the
starting point; its code blocks are the guide's.

## Invariants

- One `Context.Service` per package, identifier `"<package>/<Name>"` (scoped
  packages keep the scope: `"@misofm/partyos/Partyos"`), whose `layer`
  requires `Sui` and never builds a client. Registering the Promise face
  (below) with a given `name` is a decision made at registration time, not a
  compatibility promise owed to a predecessor's callers.
- Every member returns `Effect` or `Stream` with a closed error union: sui-effect
  errors plus the package's own `Schema.TaggedError` classes. No `Promise`, no
  `unknown`, no plain `Error` anywhere in the interface.
- Every member's requirement channel is empty: the layer captures `Sui` once
  and provides it to the effects it builds. A second owned dependency (e.g.
  `SuiGraphQL`) is provided inside the extension's own layer, not left for
  the consumer.
- Reads go through `Sui` (`getObject` with a BCS-bridge schema, `getObjectOption`,
  `getObjects`/`getObjectsOrFail`, `streamOwnedObjects`, `streamDynamicFields`
  via the safe dynamic-field type matcher, `view`). Writes go through `Tx.run`
  or `Tx.submit`; `executeTransaction` is never called directly, so the
  journal, default expiration, sender lock and reconcile apply. Expect
  `SubmissionUnknown` for most stuck submissions (plan a `reconcileAll`
  path); `Tx.build` always simulates on gRPC, so a `simulateTransaction`
  call-count assertion includes it.
- Transaction logic is exposed as recipe fragments `(tx) => void`, or
  `(tx) => A` returning builder arguments to thread — `Recipe` is the
  top-level draft type either way — so consumers compose several extensions
  into one PTB and submit once. A submit-on-behalf member exists only when it
  is the package's purpose, and the fragment is exported beside it.
- Signers and other per-call credentials are parameters (`Signer.fromSdkSigner`
  takes any SDK `Signer`, not only a `Keypair`). The layer holds only the
  extension's own credentials, read with `Config.redacted` under a prefixed
  namespace (`Config.nested("ESCROW")`).
- Every extension error declares `outcome: "applied" | "not_applied" | "unknown"`
  so `SuiError.outcome` and `Script.exitCode` can act on it; tags are prefixed
  with the package name.
- Upstream Promise packages are wrapped, never re-exported: `sui.core.x(...)`
  or `sui.core.use((client, signal) => ...)` for a raw client call,
  `Effect.tryPromise` with a mapping function for pure helpers (`SuiGraphQL.query`
  for a GraphQL call, so the `GraphQLUnavailable` passthrough from a rejected
  promise isn't re-derived by hand), every upstream result narrowed to a
  sui-effect schema before it leaves the module.
- Three layers: `layer(opts)`, `layerConfig`, `layerTest(state)`. An
  extension owning nothing but `Sui` has no fake to build —
  `layerTest = layer(fixedDeployment)` is correct as-is, not a shortcut.
  Tests use `layerExtensionTest` and `SuiTest` from `sui-effect/testing`
  (compose in a second fake's layer for an owned dependency) and open no
  socket. `layerConfig` overrides are validated through the same typed
  deployment path as `layer` — `Config.option` treats an empty variable as
  unset, never a `ConfigError`. Register every extension on one client the
  same way (all `warm` with the same chain id, or all lazy) so they share one
  base runtime and sender-lock map.
- Never `.make` a branded value (`ObjectId.make`, `StructTag.make`) from
  unvalidated input — decode it with `Schema.decodeUnknownEffect` into a
  `DecodeError` instead; an error whose schema needs an id you don't have yet
  needs its own error or an `Option`. List `tests`/`test` in the package
  tsconfig's `include`, or type-level pins never compile.
- The Promise face is `SuiExtension.fromService(Service, { name, layer })`,
  derived, never hand-written; nested namespaces and Streams are handled. A
  synchronous member (a recipe builder, a constant) throws `ExtensionNotReady`
  when read cold; pass `{ warm: { chainId? } }` to build it inside `register`
  when the layer needs no network, so members are real immediately, or call
  `client.$ready()` first — a warm or ready member is a real value, never a
  placeholder `Promise`.

## Workflow

1. Read the three shipped documents above and `docs/PLAN.md` of the target
   package if one exists. Write the spec: members with error unions, errors
   with outcomes, fragments, layers, what stays out.
2. Copy the template; rename; replace `schema.ts` with the package's BCS
   codecs. The bridge (`SuiSchema.bcs(codec, expectedType?)`) requires a
   `BcsType`; codegen's `MoveStruct`/`MoveEnum`/`MoveTuple` qualify (they
   extend `BcsStruct`/`BcsEnum`/`BcsTuple`) — a bare `{ parse }` wrapper is
   refused. Omit `expectedType` for a `view` return with no struct tag.
   Domain mapping (field renames, `$kind` enums) belongs in
   `Schema.decodeTo(DomainClass, ...)`, never in a custom `parse`.
3. Write errors first, then the service, then layers, then the facade. A
   layer picking a bundled deployment reads `sui.network` inside
   `Layer.unwrap(Effect.gen(...))`, failing a typed `<pkg>/DeploymentError`
   when none exists; `layerConfig` is that layer with `Config` supplying
   only the override.
4. Tests on the harness: happy path, every declared error, a transaction
   fragment composed with another fragment, the Promise face through
   `client.$extend` against the fake.
5. `bun run check` green; run the review checklist in the guide's section 12
   against the diff.

## Converting an existing facade

No template for a large hand-written one. Inventory every namespace and
standalone function against the target service's members; keep standalone
`Effect<A, E, Sui>` functions exported for non-facade callers and have the
service call them. Nest a dependency already extended elsewhere (a platform
wrapping a protocol package) as a namespace, `Layer.provide`-ing its
`layer(...)` inside your own so `fromService`'s `Layer<Self, E, Sui |
SuiCore>` bound still holds. Sync members go on the service like any other
member, governed by the `$ready`/`warm` rule above.

## Migrating from `@misofm/effect`

| Before | After |
|---|---|
| `SuiClient.layer(client)` | `SuiCore.layerFromClient(client)` under `Sui.layerNoDeps`; inside a facade this is done by `fromService` |
| `getObjectContent(id)` | `sui.getObject(id)` (raw bytes) or `sui.getObject(id, { schema })` |
| `getOptionalObjectContent` | `sui.getObjectOption` |
| `getObjectsContent(ids)` (silently drops errors) | `sui.getObjects(ids)`: a `Result` per id — return the array, or `Result.getOrElse`-filter for a soft read; `sui.getObjectsOrFail(ids)` fails on the first error for a hard one |
| raw `client.core.x(...)` reach-through | `sui.core.x(...)`, or `sui.core.use((client, signal) => ...)` for a call `Sui`/`SuiCore` lack |
| `listDynamicFields` | `sui.streamDynamicFields`; match with the safe dynamic-field type matcher, decode `name.bcs` with `SuiSchema.decode` |
| `deriveDynamicFieldID` + `getObjectOption` (existence) | `sui.getDynamicFieldOption` |
| `decodeBcs(codec, schema, bytes)` | `SuiSchema.decode(codec, bytes, { objectId?, expectedType? })` for bytes in hand; `SuiSchema.bcs(codec, type).pipe(Schema.decodeTo(DomainClass, ...))` as `schema` to `sui.getObject` |
| `assertObjectType` | the bridge's normalized type-tag check; `DecodeError` on mismatch |
| `buildTx(...thunks)` returning a `Transaction` object | `new Transaction(); recipe(tx)` when the caller needs the builder itself, not bytes |
| a bare `string` id | `ObjectId.make(id)` / `SuiAddress.make(id)` at the boundary; `Schema.decodeUnknownEffect(ObjectId)` for untrusted input |
| `TxThunk` | `Recipe`: sync in the SDKs; a consumer's async thunk (`async (tx) => ...`) hoists its `await` before the recipe, which stays sync |
| `buildTx(...thunks)` then `signAndExecute` / `execThunks` | compose recipes, then `Tx.run(recipe, { signer })` |
| `ParallelTransactionExecutor` | `Tx.run` per PTB under the sender lock; parallel needs distinct gas owners (`Tx.sponsored`), otherwise deferred |
| `ExecResult` extractors (`createdByType`, `allCreatedByType`, `publishedPackageId`, `balanceDelta`) | `Executed.created(type)`, `createdWhere(pred)`, `packagesPublished()`, `balanceChange(addr, coin)` (bigint), `expectCreated(type)` |
| `ObjectNotFoundError`, `ObjectTypeMismatchError`, `SuiRpcError`, `BcsDecodeError`, `TransactionFailedError` | `ObjectNotFound` / `ObjectDeleted` / `ObjectUnavailable`, `DecodeError`, `TransportError`, `DecodeError`, `ExecutionFailed` |
| hand-built `new SuiRpcError({ operation, cause })` | `TransportError.fromUnknown(method, cause, retryable?)` |
| `DeploymentError` | the extension's own `<pkg>/DeploymentError`, `outcome: "not_applied"` |
| `GraphQLUnavailableError` | sui-effect's `GraphQLUnavailable` (`SuiGraphQL` service) |
| a class registered via `$extend` with Promise methods | the service plus `SuiExtension.fromService` |

Behaviour changes to call out in the migration PR: `getObjects` no longer drops
errored ids; balance and gas are `bigint`; the redundant `waitForTransaction`
after execute is gone; on-chain failure is always the `ExecutionFailed` error;
an unknown outcome is a typed `SubmissionUnknown` carrying the signed bytes;
the registration `name`, if it changes from the predecessor's.

## Retiring a predecessor, and depending on an unreleased sui-effect

Cut a deprecation release of the superseded package first (final version,
changelog note pointing at the extension), then `npm deprecate <pkg>@"<range>"
"superseded by <new>"`; keep the old major installable. Delete it from a
workspace only once every sibling still resolving it from source (a
workspace/`link:` dependency, not a published range) has moved.

Before sui-effect has a release, `link:`/`bun link` to a separate,
independently-installed checkout is not an option — it resolves sui-effect's
own imports against its own `node_modules`, duplicating `effect` and the SDK
and failing typecheck on `#private` mismatches across every boundary-crossing
class (`link:` to an actual workspace member of the same monorepo dedupes
fine). Instead: `npm pack --pack-destination <dir>` in the sui-effect
checkout, vendor the tarball as `vendor/sui-effect-<v>.tgz` (committed),
noting the exact commit or tag packed and re-packing when it moves. Depend on
it as `"sui-effect": "file:./vendor/sui-effect-<v>.tgz"` in `devDependencies`
with the matching range in `peerDependencies`, plus
`"peerDependenciesMeta": { "sui-effect": { "optional": true } }` — bun probes
npm for a peer even when a local dependency of the same name satisfies it,
and 404s on an unpublished package. Swap-to-npm checklist on the first
release: bump `peerDependencies` to the published version range, drop the
`peerDependenciesMeta` entry, `git rm` the tarball and its `file:`
devDependency, `bun install`, rerun `test:consumer`.

## Review checklist

Reject an extension that: has a `Promise` or `unknown` in its interface; calls
`executeTransaction`, `signAndExecuteTransaction` or `waitForTransaction`
itself; holds a consumer signer or a client in its layer; exposes an upstream
package's types unnarrowed; maintains a Promise class beside the service;
submits where a fragment would do; defines an error without `outcome`; reads
`process.env` instead of `Config`; tests against the network; wraps
`Sui.layerNoDeps` in `Layer.orDie` inside a compat class instead of surfacing
the error; ships a fake script with only one key type per parent (proves
nothing about filtering); has a README `catchTag` string that doesn't match
the prefixed tag; calls `normalizeStructTag` on a dynamic-field key type
unguarded (primitives like `u64`/`bool`/`address` are legal keys); or
diverges from the sui-effect method names it wraps.
