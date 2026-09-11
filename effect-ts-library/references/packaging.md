# Packaging: layout, exports, versions, build, CI

## Layout

```
package.json  tsconfig.json  tsconfig.build.json  LICENSE  README.md  LLMS.md  AGENTS.md
src/
  index.ts          the public surface: curated re-exports only
  <subpath>.ts      one file per declared subpath (tx.ts, testing.ts, ...)
  internal.ts       everything tests and sibling modules share; not exported
  domain/           schemas, errors, codecs, value classes
  services/         one Context.Service per file: interface, layers, fake
test/               bun test files, one per module, plus *.types.test.ts
examples/           runnable examples that typecheck in CI and feed LLMS.md
docs/               spec, plan, reviews/, research/
scripts/            llms.ts and other generators
```

`src/internal.ts` is the pressure valve: anything a test or a second module
needs that is not a supported public API goes there. The `exports` map does
not mention it, so consumers cannot depend on it and you can change it freely.
The test directory's name is not load-bearing — `test/` above, `tests/` in a
host monorepo that already uses that name — only the one-file-per-module
convention and the `*.types.test.ts` suffix matter.

## package.json

```json
{
  "name": "my-lib",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "exports": {
    ".":          { "types": "./dist/index.d.ts",   "import": "./dist/index.js" },
    "./tx":       { "types": "./dist/tx.d.ts",      "import": "./dist/tx.js" },
    "./testing":  { "types": "./dist/testing.d.ts", "import": "./dist/testing.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE", "LLMS.md"],
  "sideEffects": false,
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "tsc --noEmit && bun run build && bun test",
    "llms": "bun scripts/llms.ts",
    "prepare": "effect-language-service patch",
    "prepublishOnly": "bun run check && bun run llms"
  },
  "peerDependencies": {
    "effect": ">=4.0.0-rc.112 <4.1",
    "@upstream/sdk": "^2.28"
  },
  "devDependencies": {
    "effect": "4.0.0-rc.112",
    "@effect/platform-bun": "4.0.0-rc.112",
    "@effect/language-service": "^0.87",
    "@upstream/sdk": "2.30.0",
    "@types/bun": "^1.4",
    "typescript": "^5.9"
  }
}
```

Rules:

- **Peer, not dependency,** for `effect` and for the wrapped SDK. Two copies of
  `effect` in one process means two `Context.Service` identities and layers
  that silently do not match; two copies of an SDK means `instanceof` checks
  on its error classes fail.
- **A range for `effect`, an exact rc in devDependencies.** Pinning consumers
  to one rc forces every downstream package to move in lockstep. The range is
  the set of rcs CI actually tests; document it in the README. When the
  library itself lives as a workspace member of a larger monorepo, follow
  that repo's own pinning policy (exact versions, a lockfile-enforced range)
  even where it is stricter than this; note the deviation in the README
  rather than relaxing its CI.
- **Floor the SDK at the version whose behaviour you rely on**, not the latest.
  Say why in a comment (for example, "2.28 is the first version that round-trips
  `ValidDuring` expirations through `Transaction.from`").
- **Subpaths are the module boundary.** Anything that imports
  `effect/unstable/*` (persistence, http, ai, workflow) lives behind its own
  subpath so a core consumer never loads unstable code. A `/testing` subpath
  keeps fakes out of the production bundle.
- `sideEffects: false` so bundlers tree-shake; verify no module runs code at
  import time (no `Effect.runSync` at top level, no config reads).
- A template or example package that lives inside the repo resolves the
  library through tsconfig `paths` or a workspace link, never its own
  `node_modules`. Two copies of `effect` in one process means two
  `Context.Service` identities and layers that silently do not match, and a
  `file:../..` link is not reliably installable by every package manager.

## tsconfig

```json
{
  "compilerOptions": {
    "strict": true, "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
    "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true, "verbatimModuleSyntax": true,
    "declaration": true, "skipLibCheck": true, "types": ["bun"],
    "plugins": [{ "name": "@effect/language-service" }]
  },
  "include": ["src", "test", "examples"]
}
```

`tsconfig.build.json` extends it with `outDir: dist`, `rootDir: src`,
`declarationMap`, `sourceMap`, and `include: ["src"]` only. `examples/` is
typechecked by the main config so an example that stops compiling fails CI.

`"prepare": "effect-language-service patch"` makes the language-service
diagnostics (floating effects, `Effect.fn` opportunities, multiple provides,
`any` in error channels) fail `tsc`, not just the editor. Check that a fresh
`bun install` still works before relying on it. This `prepare` script is
library-only, never something a consumer's install should need to run.
Consumers on TypeScript 7 (`tsgo`) are supported: `tsgo` does not load
`tsconfig` plugins, so verify the packed tarball also typechecks under it
if any tested consumer is on it.

## Build output

`tsc -p tsconfig.build.json` emitting `.js` plus `.d.ts` with maps is enough.
Do not bundle: consumers' bundlers handle it, and a bundle hides the
`effect` peer boundary. Verify `dist/` imports resolve (`.js` extensions or a
resolver that handles them) by installing the packed tarball into an
isolated consumer in CI: `npm pack`, `bun add ./my-lib.tgz` in a temp dir with
only `effect` and the SDK installed, `tsc` on a file that imports every subpath.

## CI

- `bun run check` on every push.
- A matrix job over the tested rcs: install `effect@<rc>` for each and run
  typecheck plus tests. Update the peer range only when the matrix passes.
- The isolated-consumer check above.
- `bun run llms` and fail if `LLMS.md` is stale (`git diff --exit-code`).
- Publish from tags with provenance (`npm publish --provenance --access public`
  under OIDC), gated by the same checks, never on merge to main.

## Versioning

Pre-1.0 while `effect` is on rc. Bump minor for any public signature change,
patch for fixes. Record in the changelog which rc range each version was
tested against.
