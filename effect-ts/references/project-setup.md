# Project setup and runtime selection

Requires: [core](core.md), [services](services.md).

Use the existing package manager, runtime, test runner and module layout unless
the task changes them. Bun is a convenient default for a new local script/CLI;
it is not an Effect dependency or a reason to migrate an existing Node app.

## Version selection

Inspect installed versions/lockfiles before editing. At this skill's baseline,
`effect@latest` is 4.0.3 (v4 is stable and LTS) while `effect@rc` still points at
a release candidate; dist-tags move. Resolve and pin the intended v4 release.
Release-train packages (`@effect/platform-*`, `sql-*`, `ai-*`, `atom-*`, `vitest`,
`opentelemetry`) ship with the same version as `effect` and must match it;
tooling such as `@effect/language-service` is versioned independently. Effect 4
requires TypeScript 5.9+ with `strict`, and Node.js 18+ on Node.

Example baseline for a new Bun app:

```sh
bun add --exact effect@4.0.3 @effect/platform-bun@4.0.3
bun add -d typescript @types/bun
```

Use public namespace subpaths, e.g. `effect/Effect`, `effect/Schema`,
`effect/http/HttpClient` and `@effect/platform-node/NodeRuntime`.
Barrels are supported, but subpaths improve bundler predictability, particularly
with Wrangler/esbuild. Never import `effect/internal/*`.

## Runtime selection

| Deliverable | Edge and adapter |
|---|---|
| Bun script/CLI/server | `@effect/platform-bun`: BunRuntime, BunServices, BunHttpServer |
| Node script/CLI/server | `@effect/platform-node`: NodeRuntime, NodeServices, NodeHttpServer |
| Deno app | `@effect/platform-deno`; inspect the installed adapter and import configuration |
| Browser app | `@effect/platform-browser`, scoped host runtime or Atom runtime; no server filesystem/process assumptions |
| React Native (Hermes) app | Core `effect` only (no RN platform package); app-lifetime ManagedRuntime or Atom runtime; see below |
| Cloudflare Worker | Web handler + invocation Context; [Cloudflare module](cloudflare/index.md) |
| Shared library | Effect values/services/Layers; [library module](library/index.md), consumer owns runtime |
| Foreign framework/SSR | ManagedRuntime or Web handler; separate application and request ownership |

Platform packages implement core capabilities such as FileSystem, Path, Stdio,
Terminal, Crypto, HTTP and worker transport. Availability differs by host; a
package named platform-browser does not provide a real server filesystem.

### React Native and Hermes

There is no `@effect/platform-react-native`, and platform-browser's storage
layers read `globalThis.localStorage`, which RN lacks. Checked against 4.0.3
source; not executed on a device:

- `effect/encoding/Base64` and `Hex` construct `TextEncoder` and `TextDecoder` at
  module load, and core modules import them: under Node with `TextDecoder`
  deleted, even `import "effect/Effect"` throws. Hermes in current RN has
  TextEncoder but no TextDecoder, so install a TextDecoder polyfill in the entry
  file before the first `effect` import. Add `react-native-get-random-values`
  when using UUID defaults (`schema/Model`) or seeded `Random`.
- HTTP: `FetchHttpClient.layer` over RN's fetch handles JSON/text/arrayBuffer
  bodies and receives the interruption `AbortSignal`. RN fetch exposes no
  `response.body` stream. For streamed responses, provide a streaming fetch through
  the `FetchHttpClient.Fetch` reference (e.g. `expo/fetch`). RN before 0.84 needs
  a URL polyfill for `URLSearchParams`/`hash` used by the HTTP modules.
- Persistence: wrap AsyncStorage/MMKV with `KeyValueStore.makeStringOnly`
  (Promise calls through `Effect.tryPromise`), or a synchronous Storage-like
  object with `KeyValueStore.layerStorage`. Use `KeyValueStore.layerSql` over
  `@effect/sql-sqlite-react-native` (op-sqlite peer) for relational or larger data,
  and `layerMemory` in tests.
- Provide `Crypto` yourself (`Crypto.make` over a native module); it has no
  default. `crypto.subtle` is absent, so EventLog encryption needs a native
  implementation.
- Own one `ManagedRuntime` per app lifetime and call `dispose()` explicitly.
  Hermes lacks `Symbol.asyncDispose` and `FinalizationRegistry`, so avoid
  `Effect.acquireDisposable` and `await using`, and expect `Atom.family` entries
  to be retained. `@effect/atom-react` peers on React 19.
- Do not import `effect/schema/SchemaJITCompiler/enable`, `effect/testing`
  (Node built-ins) or `sql/Migrator`'s dynamic loader in the app bundle. DateTime
  named time zones use `Intl.DateTimeFormat#formatToParts`; verify on the target
  engine or keep UTC/offset zones.

## Compiler and diagnostics

Enable `strict`. Prefer `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess` for new code; baseline additional diagnostics before
changing an existing project. Choose module resolution to match execution:
Bundler for a bundled application; NodeNext plus emitted `.js` imports for a
library that must run directly under Node ESM. Do not prove Node compatibility
only with Bun's more permissive resolver.

Use compatible Effect language tooling for extra diagnostics. The conventional
`@effect/language-service` plugin is editor-only unless its compiler integration
is configured. Native TypeScript toolchains have different plugin support; check
[Effect's tsgo integration](https://github.com/Effect-TS/tsgo) and the installed
package's instructions. Do not silently add an install-time compiler patch or
assume editor warnings fail CI. Document the actual check command.

Lay out source by capability/domain and keep the composition root visible.
Separate portable domain/services from host adapters. A small script may be one
file; an application need not copy an SDK's publication layout.

## Executable starters

`assets/templates/` contains Bun script, CLI, API, queue-worker, state-machine,
Node script, portable library and host-bridge examples. The queue worker is a
process worker, distinct from `assets/cloudflare-worker/`.

Compile the selected template against the target versions, then test its edge:
script success/failure; CLI argv/stdout/stderr/status; API contract and shutdown;
worker lifecycle; library packed consumer. Run the target's existing check
command. Record runtime/version limitations instead of claiming that one host's
successful typecheck proves every platform.
