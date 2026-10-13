# Source, full feature discovery, and maintenance

Requires: none. This is also the maintainer entrypoint.

## Evidence baseline and scope

This revision targets `effect@4.0.3` (stable), source commit
`967a7dc5963a23d3705259d60ccac1ce9f060a3b` (tag `effect@4.0.3`), reviewed 2026-10-13.
The official onboarding is [Welcome to Effect](https://effect.website/docs/v4/onboarding),
with [guides](https://effect.website/docs/v4/getting-started) and a
[versioned API reference](https://effect.website/docs/v4/api).
The canonical source, release tags (`effect@4.0.x`) and per-package
`CHANGELOG.md` files are in [Effect-TS/effect](https://github.com/Effect-TS/effect);
its `MIGRATION.md` covers v3 to v4 and the stability policy. Effect-TS/effect-smol
hosted early v4 development and no longer tracks releases; do not use it or the
`v3` branch for v4 APIs.

The skill has two complementary levels of coverage:

- Maintained decision guides explain when to choose feature families and the
  correctness/lifecycle constraints that declarations alone do not establish.
- The [complete generated module map](generated/modules.md) and
  [searchable export inventory](generated/api-index.jsonl) enumerate public source
  package exports, including aliases, types and namespace exports. Each module
  records its declared `@stability` (stable, unstable or experimental); each
  export has available upstream summary/use cues, category and source location.
  Side-effect-only entrypoints (e.g. `effect/schema/SchemaJITCompiler/enable`)
  are listed with no exports. This makes every feature discoverable without copying its
  implementation or loading a manual into the agent's context.

The inventory covers non-private packages with TypeScript source/export maps in
that commit, including tooling and runtime/provider adapters. Counts include
barrels and re-exports; they are not counts of distinct runtime functions.
Interface members and overload details live at the linked declaration/source,
not as separate indexed symbols. Private/internal implementation files are not
supported imports. A cataloged feature is not a claim that this revision has
behavior-tested that entire feature. Upstream documentation can itself be stale;
source, declarations and executable behavior resolve contradictions.

## Find a feature before rebuilding it

Run from any directory, using the absolute path to this skill's script:

```sh
python3 scripts/query-coverage.py 'backpressure' --limit 12
python3 scripts/query-coverage.py --module effect/Effect --symbol acquireRelease
python3 scripts/query-coverage.py --module effect/Schema --symbol toCodecJson
python3 scripts/query-coverage.py 'transaction' --limit 12
```

For each relevant result: read its guide, inspect its source/JSDoc and exact
signature, follow internal implementation only to answer a semantic question,
and read the corresponding upstream tests/type tests. Do not infer an overload
from an index summary. Search in ignored dependencies explicitly with `rg --no-ignore`.

## Match source to the target

1. Read `package.json`, lockfile and installed `effect/package.json`; note
   runtime, adapter versions and imports of `@stability unstable` modules
   (and any pre-4.0 `effect/unstable/*` paths still in the code).
2. Inspect `node_modules/effect/src`, `dist/*.d.ts`, `ai-docs` and any installed
   AGENTS/LLMS documentation. The source checkout includes `LLMS.md`, `ai-docs/`,
   `packages/effect/test/`, type tests, and `migration/` guides/annotations.
3. If full context is missing, clone the exact release into a temporary/reference
   directory. Example for this baseline:

   ```sh
   git clone --depth 1 --branch effect@4.0.3 https://github.com/Effect-TS/effect.git /tmp/effect-v4-source
   git -C /tmp/effect-v4-source rev-parse HEAD
   ```

   Reuse a matching checkout. Do not vendor megabytes into the user's project
   unless they want it maintained there. A checkout of current main can differ
   from the installed release; check out the tag matching the lockfile.
4. Compile against the target's installed package and run a focused semantic
   probe for uncertain behavior. v3 rename tables are leads, not a migration proof.

## One update procedure

Keep behavior rules in one owning reference; depend on it through `Requires`
links instead of copying it into library/Workers instructions. Code examples in
references may be sketches; executable assets must remain complete.

For an upgrade, resolve the desired release, clone a clean pinned source, read
its migration/release diff, and regenerate the inventory:

```sh
node scripts/build-coverage.mjs /path/to/effect-source /path/to/typescript-package
```

The generator uses the TypeScript compiler API (tested with 5.9.3; it is an
optional maintenance dependency, not a runtime dependency of this skill).
If the project's TypeScript exposes `createProgram`, omit the last argument.
Native TypeScript distributions that lack that API cannot generate the index.
Searching the checked-in inventory only needs Python's standard library.

Inspect added/removed modules and exports, changed signature/source links and
new unclassified families. Update the owning guide's use cases and semantic
constraints. Confirm each module's guide is appropriate; automatic routing is
an initial assignment, not editorial review. Update templates and version
provenance together, then run skill/link validation, example typechecks, semantic
checks and the workerd starter's check. Review the diff, including what was
removed. Preserve the upstream MIT license shipped beside generated summaries.

Do not claim exhaustive manual reading or formal verification from successful
index generation. Record concrete tested invariants and remaining limitations.

## Repeatable verification

```sh
python3 scripts/validate-skill.py
python3 scripts/verify-examples.py --cloudflare
```

The first checks reference links, prerequisite cycles, discovery reachability and
inventory integrity without dependencies. The second creates temporary projects,
installs the pinned baseline with Bun, typechecks eight starters and contract
assertions, runs semantic/lifecycle tests and CLI/script checks, executes emitted
Node ESM, exercises API contracts and process shutdown, then runs the Workers
binding/type/workerd/dry-run checks. It does not
deploy. Omit `--cloudflare` when that adapter is outside the changed scope.

The semantic fixture is [semantics.test.ts](../scripts/fixtures/semantics.test.ts);
its transaction-retry example intentionally demonstrates an unsafe external
mutation so the guide's replay warning is executable. It is not a production
transaction recipe. The fixtures do not cover every indexed API.

Baseline validation for 4.0.3 on 2026-10-13: all eight starters compiled; 11
semantic tests and 14 workerd tests passed; CLI/script/API/Node/bridge/shutdown
checks and the minified Wrangler dry run passed. The source inventory regenerated
identically. Reference snippets for core, services, Schema, resilience,
concurrency, streams, HTTP, CLI, testing and Cloudflare were compiled against
4.0.3 with placeholder stubs. React Native/Hermes guidance comes from source
reading and a Node probe with globals removed, not from a device run. The rc.115
review (independent Astra xhigh review and library-to-Worker consumer trial) was
not repeated. Database/provider/network integrations and all 12,792 indexed
exports were not individually executed; use the task-specific verification modules.
