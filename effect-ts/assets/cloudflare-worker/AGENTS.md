# Effect Cloudflare Worker context

- Use Effect v4 and keep its release candidate pinned exactly.
- Import namespaces from public module subpaths (`effect/Effect`,
  `effect/Schema`, `effect/unstable/http/HttpRouter`). Do not use Effect barrel
  imports; Wrangler bundles production code with esbuild.
- Keep Cloudflare entrypoints thin. `Effect.runPromise` belongs only in
  `src/index.ts`; application and service functions return Effects.
- Convert invocation bindings into request-scoped Effect services. Do not keep
  request data, binding-backed I/O, or mutable state in module globals.
- Decode every external boundary with Schema and represent expected failures as
  tagged values. Centralize logging and HTTP error rendering.
- Preserve native Request/Response streams, abort signals, status, and headers.
  Do not buffer pass-through bodies.
- Run `bun run check` before deployment. Tests execute inside workerd through
  `@cloudflare/vitest-plugin` and must call the same exported handler used in
  production.
- If adding Workers Cache, explicitly mark every response cacheable or
  `no-store`, distinguish it from the PoP-local Cache API, and test exact bytes
  for all source/cache and Range paths.
