# Public API design

Requires: [core](../core.md), [services](../services.md), [Schema](../schema.md).

Export the public surface deliberately: functions, services, Layers, data codecs,
errors and supported subpaths. Keep internal helpers private to the package;
choose files by capability rather than forcing all internals into one file.

Public signatures must state meaningful `A`, `E`, `R`. Include upstream errors
when they are intentionally part of the contract, or map to a domain taxonomy.
Avoid `any`, unjustified assertions and unexplained `unknown` error channels.
A generic low-level combinator may legitimately carry caller-defined `E`/`R`;
a library need not force every method to `R = never` or Schema.TaggedError.

Document failure conditions, cancellation, resource ownership, effect laziness,
retry/mutation behavior and ordering on public methods. Keep error variants as
narrow as the implementation justifies. An `Effect.timeout` adds TimeoutError;
either expose it or deliberately translate it. Never quietly classify an unknown
transport outcome after mutation as definitely not applied.

## Services and dependency capture

A service Layer can capture infrastructure once, leaving methods with domain
requirements only; or methods can require scoped caller services explicitly.
Choose lifetime, not cosmetic shortness of `R`. Per-call credentials are often
parameters; request-scoped authorization can be a required service. Do not capture
one user's identity in a shared Layer/cache. Public service string identifiers
are stable API: collisions reuse the same Context slot.

Use named `Effect.fn` for useful operation spans; `fnUntraced` for implementation
helpers/hot paths. Plain pure functions and implementations needed for overloads
are valid. Write overload contracts explicitly when option-dependent return types
need them; prove generic inference with consumer type tests rather than casts.

## Wrapping foreign SDKs

A broad SDK wrapper may expose a mechanical tier and a higher-level domain tier.
Preserve generics, request options, signals and error mapping for the surface you
promise; do not duplicate an entire SDK for a narrow domain requirement. An
escape hatch can accept a callback and signal while retaining the error mapper.

Forward AbortSignal through the actual SDK path. An SDK that captures another
client internally may bypass a proxy's signal injection. Test the pending
operation's abort, not merely that the wrapping fiber stops waiting. Document
non-cancellable calls and possible post-timeout mutations.

A mechanical wrapper should not silently change retry policy. Apply retries with
classified transient errors and idempotency where supported. Read and write
policies can differ; safe idempotent writes can be retried when demonstrated.

For promised completeness, compare method keys and verify signatures/generics;
a key-only test cannot detect a narrowed option or lost conditional result type.
Pagination becomes Stream when incremental consumption is useful; check cursor
termination and duplicates. Batch APIs must reconcile missing/unexpected results.

## Data and interoperability

Use Schema codecs when values cross trust/serialization boundaries. A binary
codec can have `Encoded = Uint8Array`; JSON representations need explicit
base64/string conversion or `Schema.toCodecJson`. Schema.BigInt is not itself a
JSON string codec. Test intended round-trip/normalization laws and trailing-byte
handling for parsers that can ignore extra bytes.

Choose `optionalKey` when absence is allowed but explicit undefined is not;
choose `optional` when both are part of the actual contract. External shapes
should preserve their producer's semantics. Public errors should have useful
messages and structured recovery fields; log internal causes separately from
public JSON to avoid secret leakage.

Caches of versioned data are allowed only with explicit freshness, key and
invalidation guarantees. Local locks protect one runtime; mutation correctness
across processes/restarts needs external concurrency/idempotency protocols.
