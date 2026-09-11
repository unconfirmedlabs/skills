# Testing a library

The bar is higher than for an application: consumers will read the tests as
documentation, and the fake you ship is the fake they test with.

## The fake is part of the product

- Ship `FooCoreFake.layer(script)` in `/testing`: an in-memory state (objects
  keyed by id with versions), scripted outcomes for the methods that matter
  (`succeed`, `failWith(reason)`, `transportError(status)`, `timeoutThen(found)`),
  a call recorder so tests can assert what the library sent, and a handle the
  test drives (`setObject`, `bumpVersion`, `script(...)`).
- The fake must implement the upstream's extension or registration mechanism
  itself (the Sui SDK's `$extend`, on the fake's client object, not just
  scripted at the high-level methods) — a derived Promise face is tested the
  way a consumer writes it only if that mechanism actually works against the
  fake. The fake must match a structural lookup key on all of its fields, not
  a subset (a dynamic-field name is type plus bytes; matching on type alone
  lets two same-typed keys silently collide) — document the exact matching
  rule in the harness, since an unstated one is the first thing a consumer's
  own test gets wrong.
- The fake must be faithful where faithfulness is cheap and honest where it is
  not: derive identifiers the same way the upstream does (a digest from the
  submitted bytes, not a counter), implement enough of the upstream's
  resolution to let the real builder run, and make every unscripted method die
  with a clear message rather than return something plausible.
- `Foo.layerTest = Foo.layerNoDeps` over the fake, so the library's own tests
  and the consumer's tests exercise the real opinionated code.
- `Layer.mock(FooCore, { getThing: ... })` for narrow tests of one path,
  including responses the fake cannot produce (a mismatched batch).

## What every service test file covers

- Happy path through the real high tier.
- Every error in the method's declared union, produced by the fake, asserted
  with `Effect.flip` and `_tag`.
- Cancellation: an `Effect.timeout` or `Fiber.interrupt` aborts the fake's
  pending promise (assert the signal fired).
- Retry: under `TestClock`, N transient failures then success takes exactly
  N+1 calls and consults the clock; a write is never retried.
- Include or option sets: assert what the fake received, not only what came
  back.
- Concurrency invariants (a per-key lock serializes two fibers) with
  `Deferred` and `TestClock`.

## Schemas and errors

```ts
const asserts = new TestSchema.Asserts(ThingId)
await asserts.decoding().succeed("0xabc", "0x000...abc")
await asserts.decoding().fail("nope", "Expected ...")
await asserts.encoding().succeed(value, encoded)
```

Run decoding and encoding for every branded schema and every error class.
A test that only constructs the `Asserts` object tests nothing. Assert that
`toJson` of an error containing bytes is JSON-safe.

## Type-level tests

`test/*.types.test.ts` files that only need to compile:

```ts
type Missing = Exclude<keyof UpstreamMethods, keyof FooCore["Service"]>
const complete: Missing extends never ? true : Missing = true

const withSchema = Effect.map(foo.getThing(id, { schema: S }), (t) => t.content satisfies Decoded)
const raw = Effect.map(foo.getThing(id), (t) => t.content satisfies Uint8Array)
```

Cover every generic-preserving method, every overload branch, and the exact
error union of the public functions (`Effect.Effect.Error<typeof eff>`
compared with `satisfies`).

## Acceptance criteria are the test plan

Write the plan as work packages with acceptance lines; each line maps to a
named test. An independent reviewer checks the mapping: a criterion without a
meaningful test is reported as not met, and a test that asserts the fake's own
behaviour does not count.

## Examples are tests

Every file in `examples/` is typechecked by CI, and at least one test runs
each example against the fake so the snippet that ends up in `LLMS.md` is
known to work.

## Integration

Real-network tests live behind an environment flag (`FOO_LIVE=1`), are tagged
in the file name, and never run in the default `bun test`.
