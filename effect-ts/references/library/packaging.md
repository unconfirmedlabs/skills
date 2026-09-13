# Packaging and compatibility

Requires: [API design](api-design.md), [project setup](../project-setup.md).

A package's `exports` map defines supported import paths. Emit declarations and
runtime JavaScript with resolvable imports; separate portable core from optional
Node/Bun/browser/Workers adapters and testing helpers. `sideEffects: false` is
appropriate only when it truthfully describes module evaluation.

For a library whose public types/values depend on Effect, prefer Effect as a peer
plus an exact tested development dependency. This communicates compatible runtime
versions and avoids accidental bundled copies. Context identity is a string key,
so duplicate copies do not inherently create different service identities;
incompatible versions/protocols, class identities and lifecycle behavior are the
real compatibility risks. SDK peers depend on whether sharing its identity and
version is part of the public contract, not a universal rule for every SDK.

A prerelease peer range must cover versions actually tested. An exact peer or
explicit union of tested prereleases is honest when that is the evidence; never
advertise a broad future `<4.1` range without support. Respect workspace version
policy. Most runtime/provider adapters track the Effect release train, but
language tooling and other packages may version independently; inspect peers.

Use explicit subpaths for unstable integrations when that keeps a portable core
usable without loading them. Do not promise stability for unstable APIs merely
because they are behind a subpath. Document supported Effect/runtime/SDK versions
and expand the matrix only after checks pass.

## Build and consumer verification

Use the project's build system. For plain Node-compatible ESM, NodeNext resolution
and `.js` import specifiers make emitted output directly loadable. A bundled
library is valid when dependencies/peers and exports are externalized correctly;
do not accidentally bundle a private Effect runtime into a shared library.

Check from an isolated **packed tarball** consumer, not only source aliases:

1. Build and pack the intended files; inspect contents/exports/declarations.
2. Install the tarball with each supported peer/runtime combination in a temp
   consumer; avoid resolving dependencies through the original workspace.
3. Typecheck public imports, generics, error/requirements and optional adapters.
4. Execute representative imports/operations on every advertised runtime.
5. Confirm omitted optional adapters do not break core import or tree shaking.

A Bun import test does not prove Node ESM resolution. A typecheck does not prove
published JS files exist. Development workspace links are fine for daily work;
packed-consumer tests catch differences from publication. Avoid claiming every
local link creates duplicate identities.

Documentation, examples and generated API material should be included when part
of the product. Do not add a compiler-patching `prepare` script that consumers
must execute just to install the package. Configure diagnostics in development/CI
using a compatible supported toolchain.

Version public type changes intentionally: error union, required service,
serialization, runtime support or default changes affect consumers. Build, tests,
example checks and packed-consumer validation prepare a release; publish/tag/
deprecate only within the user's authorized task, not as an implied skill step.
