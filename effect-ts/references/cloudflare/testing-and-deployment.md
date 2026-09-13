# Testing and deployment

Requires: [testing and observability](../testing-and-observability.md), [runtime and build](runtime-and-build.md).

## Test layers

Use both layers of testing:

1. Focused Effect tests exercise domain programs with deterministic test
   services, `TestClock`, and in-memory state. They make every tagged failure and
   transition cheap to cover.
2. Worker tests run under `@cloudflare/vitest-plugin` in workerd. Unit-style
   tests import the default handler and pass `env` plus an execution context;
   integration-style tests call `exports.default.fetch`. These catch runtime API,
   compatibility flag, binding, streaming, and module-resolution mismatches.

Cloudflare renamed `@cloudflare/vitest-pool-workers` to
`@cloudflare/vitest-plugin` in 2026. Use the latter with Vitest 4.1+ or later.
Configure it from the same `wrangler.jsonc` used for production:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })]
})
```

Run `wrangler types` first and include the generated declaration plus
`@cloudflare/vitest-plugin/types` in the test tsconfig. The plugin isolates
storage by test file; reset or seed state explicitly where the test contract
needs stronger isolation.

## HTTP matrix

For every endpoint, cover:

- success and each documented error status/code;
- malformed path/query/header/body input;
- supported methods, explicit 405 behavior, OPTIONS where applicable;
- GET and HEAD parity for status and headers, with no HEAD body;
- content type, cache-control, validators, CORS, and security headers;
- binding hit, not-found, transient failure, and fallback behavior;
- authentication and tenant/cache partitioning when present;
- aborted upstream requests and `waitUntil` completion when relevant.

Test the same exported Fetch handler used by production. Do not test a parallel
router or reimplement the binding policy in a mock-only handler.

## Exact bytes and streams

Status and length are not proof of byte correctness. For an R2/proxy/cache or
streaming endpoint, construct deterministic binary fixtures and assert:

- whole-body bytes match the fixture exactly;
- cached/mirrored and origin/fallback paths return identical bytes;
- representative closed, open-ended, and suffix ranges return the exact slice;
- invalid and unsatisfiable ranges use the intended status and headers;
- GET and HEAD share validators and representation metadata;
- repeated cacheable responses are byte-identical;
- transformed variants are deterministic or carry a validator/cache policy that
  acknowledges nondeterminism.

Hash large bodies in tests and deployment probes, but keep at least small tests
that compare `Uint8Array` values directly so slice offsets are visible.

Workers Cache behavior itself requires an actual deployed/preview cache test;
local workerd proves handler behavior but cannot prove global tier hits. Request
a fresh cache key twice and inspect `Cf-Cache-Status`, then compare hashes and
repeat representative Range requests.

## Verification ladder

Run in this order:

```sh
bun run cf-typegen
bun run typecheck
bun run test
bunx wrangler deploy --dry-run --minify
```

For a risky change, add a test-environment deploy and smoke test before
production. A dry run proves bundling, not remote binding IDs, routes, cache
admission, permissions, or compatibility behavior.

After an authorized deployment:

1. record the deployed Worker version and route;
2. smoke-test health and one representative route per binding;
3. verify headers and exact response bytes;
4. for Workers Cache, use a fresh URL/key and observe `MISS` then `HIT`;
5. check logs for defects, unexpected retries, and leaked internal details.

Never deploy merely because a skill says to verify deployment. Deployment is an
external mutation and still requires user authorization.

Sources: [Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/),
[write your first Worker test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/),
[Wrangler types](https://developers.cloudflare.com/workers/languages/typescript/).
