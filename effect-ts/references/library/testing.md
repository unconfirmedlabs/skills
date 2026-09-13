# Library verification

Requires: [API design](api-design.md), [testing and observability](../testing-and-observability.md).

Test the real library against controlled infrastructure. A fake is useful when
consumers need it and should be exposed in a testing subpath; small stateless
libraries may only need pure/property tests. The library's own high-level tests
should use the same supported fake when it is shipped.

Fake only the dependency seam. Preserve relevant backend semantics: structural
keys, option handling, error outcomes, registration hooks and pagination. Fail
clearly on unscripted operations rather than returning plausible success. A fake
must not reconcile a refused operation into success or hide ambiguous outcomes.

| Contract | Evidence |
|---|---|
| Values/errors | Real library success paths and each reachable public failure; assert fields and channel, not only a tag |
| Generic inference | Consumer type tests for every overload/conditional branch, exact success/error/requirements |
| Cancellation | Pending dependency receives abort/cleanup; verify whether remote work can still complete |
| Retry | Attempt count, classification and deadline with TestClock; duplicate mutation protection |
| Scope ownership | Acquire/use/release on success, failure, interruption and early stream cancellation |
| Concurrency | Deferred/barrier-controlled overlapping calls, sharing/locking/partition behavior |
| Codec contract | Valid/invalid inputs, explicit encoding and JSON round trips, intended normalization laws |
| Packaging | Isolated packed consumer imports and execution, per supported runtime/peer version |

Negative type assertions should prove rejected misuse, including missing required
services and impossible error handling; do not use `as any` to make a test pass.
A `satisfies` check can establish assignability but not always exact type equality;
use the project's type-test tool or bidirectional equality checks where needed.

When testing scope/cancellation, use `Exit`/`Cause` to distinguish failure, defect
and interruption. `Effect.flip` proves an expected failure only; it does not
classify every termination mode. Property tests need isolated mutable fixtures per
case, reproducible seeds/replay and meaningful laws, not tests of the generator.

Examples should compile against the public package; execute meaningful examples
against fakes or local adapters. Real-network tests are separate, scoped and
credentialed. Map each important acceptance invariant to evidence; mark uncovered
invariants and fake limitations explicitly.
