# Project setup and runtime selection

Requires: [core](core.md), [services](services.md).

Use the existing package manager, runtime, test runner and module layout unless
the task changes them. Bun is a convenient default for a new local script/CLI;
it is not an Effect dependency or a reason to migrate an existing Node app.

## Version selection

Inspect installed versions/lockfiles before editing. At this skill's baseline,
`effect@rc` resolves to 4.0.0-rc.115 while `latest` is still v3; dist-tags move.
Resolve and pin the intended v4 release. Verify each adapter's peer requirements;
most release-train adapters align, but tooling packages have independent versions.

Example baseline for a new Bun app:

```sh
bun add --exact effect@4.0.0-rc.115 @effect/platform-bun@4.0.0-rc.115
bun add -d typescript @types/bun
```

Use public namespace subpaths, e.g. `effect/Effect`, `effect/Schema`,
`effect/unstable/http/HttpClient` and `@effect/platform-node/NodeRuntime`.
Barrels are supported, but subpaths improve bundler predictability, particularly
with Wrangler/esbuild. Never import `effect/internal/*`.

## Runtime selection

| Deliverable | Edge and adapter |
|---|---|
| Bun script/CLI/server | `@effect/platform-bun`: BunRuntime, BunServices, BunHttpServer |
| Node script/CLI/server | `@effect/platform-node`: NodeRuntime, NodeServices, NodeHttpServer |
| Deno app | `@effect/platform-deno`; inspect the installed adapter and import configuration |
| Browser app | `@effect/platform-browser`, scoped host runtime or Atom runtime; no server filesystem/process assumptions |
| Cloudflare Worker | Web handler + invocation Context; [Cloudflare module](cloudflare/index.md) |
| Shared library | Effect values/services/Layers; [library module](library/index.md), consumer owns runtime |
| Foreign framework/SSR | ManagedRuntime or Web handler; separate application and request ownership |

Platform packages implement core capabilities such as FileSystem, Path, Stdio,
Terminal, Crypto, HTTP and worker transport. Availability differs by host; a
package named platform-browser does not provide a real server filesystem.

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
