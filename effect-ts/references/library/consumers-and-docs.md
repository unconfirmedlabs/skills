# Consumers, interoperability and documentation

Requires: [API design](api-design.md), [packaging](packaging.md).

Show an Effect consumer providing the required Layer and composing operations
without running inside the library. Include error recovery and a complete runtime
edge, not just a success-only fragment with undeclared services.

## Promise and stream consumers

If needed, derive a facade from the same Effect operations. A small explicit
adapter is often clearer than a recursive proxy. Own a ManagedRuntime, define
when it builds, and expose disposal. Translate failures deliberately: runPromise
rejects with a squashed cause, while runPromiseExit preserves full Exit evidence.
Promise callers lose a static error channel; retain tagged public failures when
that is their documented contract.

Preserve synchronous members as synchronous values. Lazy runtime construction
cannot truthfully expose an unavailable value as if it already exists. Use an
async factory, explicit readiness, eager safe construction, or an Effect getter.
Do not return a Promise under a synchronous type or confuse nested value objects
with namespaces in a generic proxy.

Bridge Stream to AsyncIterable/ReadableStream with cancellation and lifetime
ownership: early return/cancel must stop the underlying computation and finalize
resources. Avoid one unbounded `runCollect` to emulate streaming. Test disposal
while calls/streams are active and define subsequent-call behavior.

## Extensions

When a host library has an extension contract, use its existing services/error
and lifecycle conventions. Do not invent a second client/runtime or require a
Sui-shaped `fromService` helper for every library. Publish an extension guide and
copyable testable example when extensions are an actual product capability.
The separate Sui extension skill owns Sui-specific signers/builders/submissions.

## Documentation

Keep public JSDoc accurate about values, failures, requirements, cancellation,
mutation/retry semantics and ownership. Show tested runtime/peer versions and
complete examples in the README. For a large API, generated agent documentation
can index public symbols and examples; a small library need not add a bespoke
LLMS generator. Prefer one source for signatures/examples to prevent drift.

If generating docs, use the export map and real types: avoid giant inferred
Schema combinator dumps, include inherited error fields, deduplicate re-exports,
and compile/run extracted examples. `@effect/docgen`, `@effect/doctest` and
other tooling in the inventory may fit better than custom scripts.

A concise AGENTS.md can state project-specific invariants and actual check
commands. Do not copy a generic skill's entire policy into every generated repo.
Documentation/release checks do not authorize publishing or deprecating packages.
