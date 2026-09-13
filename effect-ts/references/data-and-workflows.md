# Data and distributed application capabilities

Requires: [core](core.md), [services](services.md), [Schema](schema.md).

Load the needed branch; these compose with libraries, APIs, Workers and CLIs.

| Situation | Module |
|---|---|
| SQL, typed queries, models, migrations, transactions | [SQL and persistence](sql-and-persistence.md) |
| Key-value storage, persisted caching/queues, distributed limits | [SQL and persistence](sql-and-persistence.md) |
| Durable activities, timers, deferred work, sagas | [Workflow, cluster and event logs](workflow-and-cluster.md) |
| Stateful entities, sharding, runners, distributed event replication | [Workflow, cluster and event logs](workflow-and-cluster.md) |
| Text/structured generation, chat, tools, embeddings, MCP | [AI](ai.md) |

Choose persistence semantics before APIs: in-memory vs durable, atomic vs
multi-step, at-most-once vs at-least-once, isolated vs shared, idempotent vs
reconciled mutations. No Effect type by itself proves a remote consistency or
delivery guarantee. Driver/provider implementations and their source tests matter.
