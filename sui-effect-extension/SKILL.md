---
name: sui-effect-extension
description: Write, migrate or review a Sui SDK package as a sui-effect extension: an Effect v4 Context.Service built on sui-effect's Sui and Tx services with a derived $extend Promise face. Use when creating a TypeScript SDK for a Move package, converting a package from @misofm/effect or from a hand-written @mysten/sui client extension, or reviewing one. Not for sui-effect itself (see effect-ts-library) and not for applications that only consume extensions.
---

# sui-effect extensions

sui-effect wraps `@mysten/sui` 2.x in Effect v4: `SuiCore` is the mechanical
one-to-one tier, `Sui` the opinionated tier (typed object reads, streams,
chain time, per-sender locks), `Tx` the transaction lifecycle (build, sign,
submit with a journal and reconcile), `Script` the on-demand script preset,
and `SuiExtension.fromService` the Promise face. An extension is how a Move
package's SDK is shipped on top of it. The authoritative contract ships inside
the package: read `node_modules/sui-effect/docs/extensions.md` in full before
writing code, then `node_modules/sui-effect/LLMS.md` for every signature and
`node_modules/sui-effect/AGENTS.md` for the library's own rules. Copy
`examples/extension-template/` from the sui-effect repository as the starting
point; its code blocks are the guide's.

## Invariants

- The extension is one `Context.Service` per package with identifier
  `"<package>/<Name>"`, whose `layer` requires `Sui` and never builds a client.
- Every member returns `Effect` or `Stream` with a closed error union: sui-effect
  errors plus the package's own `Schema.TaggedError` classes. No `Promise`, no
  `unknown`, no plain `Error` anywhere in the interface.
- Every member's requirement channel is empty: the layer captures `Sui` once
  and provides it to the effects it builds (`Effect.fn(..., Effect.provideService(Sui, sui))`).
- Reads go through `Sui` (`getObject` with a BCS-bridge schema, `getObjectOption`,
  `getObjects`, `streamOwnedObjects`, `streamDynamicFields`, `view`). Writes go
  through `Tx.run` or `Tx.submit`; `executeTransaction` is never called directly,
  so the journal, default expiration, sender lock and reconcile apply.
- Transaction logic is exposed as recipe fragments `(tx) => void` so consumers
  compose several extensions into one PTB and submit once. A submit-on-behalf
  member exists only when it is the package's purpose, and the fragment is
  exported beside it.
- Signers and other per-call credentials are parameters. The layer holds only
  the extension's own credentials, read with `Config.redacted` under a prefixed
  namespace (`Config.nested("ESCROW")`).
- Every extension error declares `outcome: "applied" | "not_applied" | "unknown"`
  so `SuiError.outcome` and `Script.exitCode` can act on it; tags are prefixed
  with the package name.
- Upstream Promise packages are wrapped, never re-exported: `sui.core.use` when
  a call needs the SDK client object, `Effect.tryPromise` with a mapping function
  for pure helpers, and every upstream result narrowed to a sui-effect schema
  before it leaves the module.
- Three layers: `layer(opts)`, `layerConfig`, `layerTest(state)`. Tests use
  `layerExtensionTest` and `SuiTest` from `sui-effect/testing` and open no socket.
- The Promise face is `SuiExtension.fromService(Service, { name, layer })`,
  derived, never hand-written. Nested namespaces and Streams are handled.

## Workflow

1. Read the three shipped documents above and `docs/PLAN.md` of the target
   package if one exists. Write the spec: members with error unions, errors
   with outcomes, fragments, layers, what stays out.
2. Copy the template; rename; replace `schema.ts` with the package's BCS codecs
   (generated `@mysten/codegen` output has `parse`, which the bridge accepts:
   `SuiSchema.bcs(codec, "0x…::module::Type")`).
3. Write errors first, then the service, then layers, then the facade.
4. Tests on the harness: happy path, every declared error, a transaction
   fragment composed with another fragment, the Promise face through
   `client.$extend` against the fake.
5. `bun run check` green; run the review checklist in the guide's section 12
   against the diff.

## Migrating from `@misofm/effect`

| Before | After |
|---|---|
| `SuiClient.layer(client)` | `SuiCore.layerFromClient(client)` under `Sui.layerNoDeps`; inside a facade this is done by `fromService` |
| `getObjectContent(id)` | `sui.getObject(id)` (raw bytes) or `sui.getObject(id, { schema })` |
| `getOptionalObjectContent` | `sui.getObjectOption` |
| `getObjectsContent(ids)` (silently drops errors) | `sui.getObjects(ids)` returns a `Result` per id |
| `listDynamicFields` | `sui.streamDynamicFields` |
| `decodeBcs(codec, schema, bytes)` | `SuiSchema.decode(codec, bytes, { objectId?, expectedType? })` for bytes in hand; `SuiSchema.bcs(codec, type).pipe(Schema.decodeTo(DomainClass, ...))` passed as `schema` to `sui.getObject` |
| `assertObjectType` | the bridge's normalized type-tag check; `DecodeError` on mismatch |
| `TxThunk` | `Recipe` (already synchronous) |
| `buildTx(...thunks)` then `signAndExecute` / `execThunks` | compose recipes, then `Tx.run(recipe, { signer })` |
| `ExecResult` extractors (`createdByType`, `allCreatedByType`, `publishedPackageId`, `balanceDelta`) | `Executed.created(type)`, `createdWhere(pred)`, `packagesPublished()`, `balanceChange(addr, coin)` (bigint), `expectCreated(type)` |
| `ObjectNotFoundError`, `ObjectTypeMismatchError`, `SuiRpcError`, `BcsDecodeError`, `TransactionFailedError` | `ObjectNotFound` / `ObjectDeleted` / `ObjectUnavailable`, `DecodeError`, `TransportError`, `DecodeError`, `ExecutionFailed` |
| a class registered via `$extend` with Promise methods | the service plus `SuiExtension.fromService` |

Behaviour changes to call out in the migration PR: `getObjects` no longer drops
errored ids; balance and gas are `bigint`; the redundant `waitForTransaction`
after execute is gone; on-chain failure is always the `ExecutionFailed` error;
an unknown outcome is a typed `SubmissionUnknown` carrying the signed bytes.

## Review checklist

Reject an extension that: has a `Promise` or `unknown` in its interface; calls
`executeTransaction`, `signAndExecuteTransaction` or `waitForTransaction`
itself; holds a consumer signer or a client in its layer; exposes an upstream
package's types unnarrowed; maintains a Promise class beside the service;
submits where a fragment would do; defines an error without `outcome`; reads
`process.env` instead of `Config`; tests against the network; or diverges from
the sui-effect method names it wraps.
