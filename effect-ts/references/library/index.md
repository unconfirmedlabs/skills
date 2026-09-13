# Reusable Effect libraries

Requires: [core](../core.md), [services](../services.md), [Schema](../schema.md).

A library exports composable computations, services, Layers, codecs and errors.
Its consumer chooses the runtime. This also makes shared code usable from scripts,
CLIs, APIs, browsers and Workers; publication is an additional concern.

| Concern | Read |
|---|---|
| Contracts, wrappers, dependency capture, error taxonomy | [API design](api-design.md) |
| Exports, peer compatibility, build and packed consumers | [Packaging](packaging.md) |
| Fakes, type assertions, lifecycle and contract tests | [Testing](testing.md) |
| Promise consumers, extensions, documentation | [Consumers and docs](consumers-and-docs.md) |

Start with supported use cases and public signatures: success, failures,
requirements, cancellation and ownership. Implement the smallest complete
consumer path. A mechanical SDK wrapper plus a higher-level service is useful
when promising broad SDK access; a small domain library need not mirror an SDK.

Keep runtime-specific code in explicit adapters/subpaths. Provide a Promise face
when needed, derived from the Effect implementation with explicit disposal and
stream cancellation. Publish reusable test Layers when consumers benefit.

The former library skill generalized Sui-specific policies. Signers, transaction
phases, binary codecs and SDK registration belong only where the actual contract
needs them; the Sui extension skill owns that domain's conventions.
