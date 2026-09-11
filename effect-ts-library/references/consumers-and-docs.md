# Consumers and documentation

## Effect consumers

They provide your layers and `yield*` your services. Make that one line:
`Effect.provide(Foo.layer)` or `Foo.layerConfig`. Export the layer types so a
consumer's own layer graph typechecks against yours.

## Promise consumers: derive the facade

Never maintain a Promise API by hand beside the Effect one; they drift. Derive
it:

```ts
export const foo = (opts) => FooExtension.fromService(Foo, { layer: Foo.layer(opts) })
```

Name the helper `<Lib>Extension.fromService` (`SuiExtension.fromService` in
sui-effect) — one name across the library and every extension skill that
cites it, not a per-package `Facade`.

`fromService` builds a `ManagedRuntime` lazily on first call over the layer
and its dependencies, maps every Effect member to a Promise method, Stream
members to `AsyncIterable`, nested plain objects recursively, passes values
through, rejects with the same tagged error instances (so `_tag` still works),
and exposes `dispose()`. This is the only place `run*` appears in `src/`. A
synchronous member (a constant, a builder function) must be truthful, not a
placeholder: build it eagerly when the layer needs no network (a registration
opt-in like sui-effect's `warm`), or fail fast with a typed not-ready error
before the runtime exists — never return a `Promise` standing in for a value
that already exists.

When the upstream SDK has an extension mechanism (the Sui SDK's
`client.$extend({ name, register })`), the derived facade is what you register,
so existing Promise callers keep working unchanged while Effect callers use
the service.

## Client-extension packages

If your library is the foundation others build extensions on, publish the
contract they must follow as a document in the package and a copyable
template package that typechecks against your pinned rcs:

- an extension is a `Context.Service` whose layer requires your services,
  never its own client;
- every method returns an Effect with a closed union of your errors plus its
  own tagged errors;
- contributions to a multi-step operation are fragments (a recipe that appends
  to a builder), not submissions, so consumers compose several extensions
  into one operation;
- `layer(opts)`, `layerConfig` with a prefixed env namespace, `layerTest` over
  your fake;
- per-call credentials are parameters;
- every member's `R` is empty: the layer captures the library's services and
  provides them to the effects it builds, so a consumer provides only the
  extension's layer;
- every extension error declares the outcome classifier (`applied`,
  `not_applied`, `unknown`); an undeclared tag is unclassified to the
  exit-code mapper, not a default;
- a derived Promise face via your facade helper.

Provide a test harness in `/testing` (your fake plus helpers to script state)
so an extension's tests need no network. Copy the guide's code blocks from the
template so they cannot drift.

## LLMS.md

Generate it; never hand-write it. A `scripts/llms.ts` walks the public
surface (the `exports` map and the JSDoc of every exported symbol), emits one
section per module with each function's signature and its error union in
words, and appends every file under `examples/` verbatim. CI fails if the
committed file is stale. Ship it in `files` so it is in `node_modules` where
agents look (`node_modules/<pkg>/LLMS.md`), and link it from the README.

Generated output needs three readability rules. A Schema constant's inferred
type is pages of combinators: print the decoded type only, not the
combinator dump. An empty-bodied `Schema.TaggedError` class shows no fields
in a `.d.ts`: enumerate the instance type's properties so the fields appear.
A symbol re-exported through more than one subpath prints once, not once per
path.

## AGENTS.md

A short file at the package root, modelled on the invariants of this skill
plus the package's own: the tiers, the error taxonomy in one table, what is
never done (run effects in `src/`, cache versioned state, hold credentials in
a layer), and the check command. Agents read it before the code; keep it
under a page.

## README

Install, the shortest complete example (typechecked from `examples/`), the
tier or module map, the error table, the tested rc matrix, and a pointer to
`LLMS.md` and the extension guide. No prose that duplicates JSDoc.

## Release checklist

- `bun run check` green; `LLMS.md` regenerated and committed.
- Peer ranges match the CI matrix; `@upstream/sdk` floor unchanged or its
  reason updated.
- `src/index.ts` diff reviewed: every new export is intended, nothing from
  `internal.ts` leaked.
- Every public signature change has a changelog entry naming the error union
  change if any.
- If this release supersedes another published package, deprecate it in the
  same release (`npm deprecate <pkg>@"<range>" "superseded by <new>"`), not
  after.
- Isolated-consumer install passes on the packed tarball.
- Tag, publish with provenance, verify the tarball contains `dist/` and
  `LLMS.md`.
