---
name: effect-ts-library
description: Author or review a reusable TypeScript library built on Effect v4 (effect@rc) that other packages, apps and agents depend on: an SDK wrapper, a service layer for a domain, a shared foundation package, or a client-extension package. Use when the deliverable is a published npm package exposing Context.Service classes, Layers, Schema types and typed errors to consumers you do not control. Not for applications, CLIs or servers (use the effect-ts skill), and not for Effect v3.
---

# Effect v4 libraries

An application composes layers once at its edge and owns its runtime. A library
owns neither: it ships services, layers, schemas and errors that a consumer
composes into a runtime the library never sees, and its public names outlive
every internal decision. Everything in the `effect-ts` skill still applies
inside the implementation; this skill adds the rules that come from having
consumers. The worked example throughout is `sui-effect`, a wrapper over
`@mysten/sui`; the patterns are not specific to it.

## Invariants

- The package exposes exactly one public surface, `src/index.ts` plus declared
  subpaths, and everything else lives in `src/internal.ts` (absent from the
  `exports` map). A consumer can only import what you intend to support.
- Every public function has a closed error union in its signature and a JSDoc
  block that states it in words. No `unknown`, no `Error`, no `Cause` in any
  error channel a consumer sees.
- Every error is a `Schema.TaggedError` with a unique tag prefixed by the
  package name where collision is plausible, and every field is JSON-safe
  (bytes as base64 codecs, bigints as `Schema.BigInt`), so `toJson` and
  round-trips through logs, RPC and journals work.
- Dependencies are `Context.Service` classes with path-like identifiers
  (`"<package>/<Name>"`). Credentials, signers and other per-call values are
  parameters, never services, because a service in `R` cannot say which one.
- A library never runs effects. `Effect.runPromise`, `runSync`, `runFork` and
  `ManagedRuntime` appear only inside an explicitly documented Promise facade
  for non-Effect consumers, and that facade is derived from the Effect surface,
  not maintained beside it.
- No platform package in `src/`. `@effect/platform-bun`, `@effect/platform-node`
  and `bun:*` are devDependencies for tests and examples only; entrypoints that
  need a runtime take it as a parameter or use `process` alone.
- Names mirror the thing wrapped. A consumer who knows the upstream SDK guesses
  your method names; an agent's training data does the same.
- Every service ships a fake or mock layer in a `/testing` subpath, and the
  library's own tests exercise the real high-level code over that fake under
  `TestClock`. Consumers test against the same fake.
- Versions are explicit: `effect` as a peer range covering the tested rcs,
  exact rc in devDependencies, a CI matrix that proves the range, and every
  `effect/unstable/*` import isolated behind an optional subpath.
- The package ships its own agent documentation: `LLMS.md` generated from
  source JSDoc and examples, an `AGENTS.md` with the invariants, and examples
  that typecheck in CI.

## Compose references

| Situation | Read |
|---|---|
| Package layout, exports map, peer ranges, build, CI | [packaging](references/packaging.md) |
| Service shape, two-tier wrappers, overloads and `Effect.fn`, errors, schemas, streams | [api-design](references/api-design.md) |
| Fakes, `Layer.mock`, `TestClock`, schema round-trips, type-level tests, acceptance criteria | [testing](references/testing.md) |
| Promise facades, client extensions, LLMS.md, AGENTS.md, examples, release checklist | [consumers-and-docs](references/consumers-and-docs.md) |

## New library

1. Write the spec first: audiences, public modules, every service with its
   members and error unions, the error taxonomy as a table, what is deferred.
   Have it reviewed adversarially before code; the cheapest bugs to fix are the
   ones in a signature.
2. Scaffold per [packaging](references/packaging.md); get `bun run check`
   (typecheck, build, test) green on a smoke test before any feature.
3. Domain first: branded schemas, errors, codecs. Round-trip every one with
   `TestSchema.Asserts` decoding and encoding.
4. Mechanical tier: a one-to-one wrap of the upstream surface with one error
   mapper, signal forwarding, spans, and a completeness type test.
5. Opinionated tier on top, plus the fake layer and the tests that drive the
   real opinionated code over the fake under `TestClock`.
6. Consumer faces: Promise facade, extension registration, examples, `LLMS.md`.
7. Independent verification against the spec before release, with a
   verification log in `docs/reviews/`.

## Review checklist

Reject a library that: exports helpers only its tests need; declares a
method's error union wider than the mapper can produce or narrower than the
upstream can throw; uses `Effect.fn` where an overload set is needed, or a
plain arrow returning `Effect.gen` where `Effect.fn` would do; keeps a Promise
facade by hand instead of deriving it; caches versioned upstream state; runs
effects or reads `process.env` inside `src/`; lets a `Uint8Array` reach a
JSON boundary; pins consumers to one rc; ships a fake that the library's own
tests do not use; or documents behaviour the code does not have.
