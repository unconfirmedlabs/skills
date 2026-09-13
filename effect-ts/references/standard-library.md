# Effect as a TypeScript standard library

Requires: [core](core.md). Read [Schema](schema.md) when values cross a boundary.

Prefer these modules when they replace custom logic or improve composition. Pure
code need not become an Effect; keep failure/absence explicit and choose data
structures for measured access patterns. Find every operation and its use cue in
[the source inventory](source-and-coverage.md).

| Situation | Feature families and selection criteria |
|---|---|
| Collection transforms, grouping, sorting, traversal | `Array`, `Iterable`, `Record`, `Tuple`; arrays for bounded data, lazy Iterable for pure traversal, Stream for effectful/unbounded input |
| Persistent collections or efficient immutable append | `HashMap`, `HashSet`, `Chunk`; choose equality/hash semantics deliberately and benchmark bulk updates |
| Ordered/range operations | `Order`, `Ordering`, Array sorting and `TxPriorityQueue`; choose a lawful comparator and a real data structure for the access pattern |
| Mutable implementation internals | `MutableHashMap`, `MutableHashSet`, `MutableList`, `MutableRef`; encapsulate mutation, use Ref/Tx collections for effectful coordination |
| Prefix lookup, graph algorithms, partition routing | `Trie`, `Graph`, `HashRing`; trie for paths/prefixes, graph for DAG/dependency traversal, ring for stable shard assignment |
| Optional values and synchronous fallible calculation | `Option`, `Result`; absence is not automatically an exception; choose a domain error when lifting with Effect |
| Exhaustive branch logic | `Match`, `Data.taggedEnum`, Schema tagged unions; reject unhandled domain states with exhaustive matching |
| Composable predicates and selection | `Predicate`, `Filter`; Filter can transform/select, Predicate narrows/decides |
| Equality, ordering, combining | `Equal`, `Hash`, `Equivalence`, `Order`, `Combiner`; custom Hash and Equal must agree; do not assume native Map/Set adopts them |
| Domain distinction without runtime wrapper | `Brand`, `Newtype`; nominal distinctions alone do not validate values, decode with a refined Schema at the boundary |
| Precise decimal arithmetic | `BigDecimal`; choose scale/rounding and wire representation explicitly (money/measurements); JS Number can lose decimal precision |
| Integers, numeric/text/boolean helpers | `BigInt`, `Number`, `String`, `Boolean`; total/Option/Result variants where parsing, division or indexing can fail |
| Size and time budgets | `ByteSize`, `Duration`; distinguish binary/decimal size units and explicit time units, avoid accidental bytes/seconds/milliseconds mixing |
| Instants, zones, calendars and recurrence | `DateTime`, `Cron`; distinguish UTC instant, local civil time, zone rules and interval schedules; test DST boundaries |
| Random sampling vs security | `Random` for controllable sampling/shuffle, `Crypto` for cryptographic randomness and digests; `Hash` is not an integrity/security hash |
| Nested immutable updates and wire patches | `Optic`, `Struct`, `JsonPointer`, `JsonPatch`; validate patch paths/operations and handle failed patch preconditions |
| Encoding and numeric representations | `Encoding`, `JsonSchema`, Schema codecs; base64/hex do not encrypt, encode bytes/bigints explicitly for JSON |
| Pure composition and TypeScript utilities | `Function` (`pipe`, `flow`, `dual`), `Types`, `HKT`, `Unify`; use HKT/variance tools for reusable abstractions when inference needs them |
| Reductions and changes | `Reducer`, `Combiner`, `Differ`; fold structured results or describe composable patches with the required laws |
| Runtime/interop protocols | `Effectable`, `Runtime`, `Take`, `PrimaryKey`, `StandardSchema`, `Redactable`; advanced interoperability hooks, selected from their current source contracts |
| Additional pure utilities | `Symbol`, `RegExp`, `UndefinedOr`, `NonEmptyIterable`, `Formatter`, `Utils`; use exact helpers and representation semantics from the inventory |
| Implementing compatible value types | `Pipeable`, `Inspectable`, `Equal`, `Hash`; respect protocol laws, avoid exposing secrets in inspect/JSON methods |
| Secrets and service-provided ambient values | `Redacted`, `Config`, `Context.Reference`; unwrapping secrets is an explicit trust boundary; references have defaults and are overridable |

Version-sensitive equality deserves tests during migration. `Equal.equals` in v4
supports structural comparison for many plain values, but collection modules can
use different key policies. In particular, ordinary object keys in
`MutableHashMap` use reference identity unless they implement the appropriate
protocols. Equal keys must hash equally; mutating hash-relevant fields after
insertion invalidates lookup assumptions.

`DateTime.now`/Clock supports controlled application time, while pure DateTime
construction/formatting needs no service. TestClock does not turn Random into a
seeded generator; inject/configure random behavior separately. Cryptographic
behavior should be tested through an explicit service seam without replacing
production security randomness with deterministic Random.

The inventory also routes advanced or newly added utility modules here; inspect
its module-specific summary before choosing one. Do not invent a missing API from
v3 names or a similarly named JavaScript utility.
