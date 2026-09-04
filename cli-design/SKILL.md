---
name: cli-design
description: Design or audit stable agent-facing CLI contracts. Use when creating or revising a CLI, especially machine I/O, streams, remote mutations, or repeated-call performance; not for copy-only help, internal implementation, or one-off shell use unless contract concerns apply.
---

# Agent-First CLI Design

Treat argv, stdin, stdout, stderr, and exit status as a public protocol. Design
that protocol first and human rendering second; human-second does not mean
human-hostile. Optimize the full agent loop, including repeated startup,
context-bearing output, ambiguity, and recovery calls. Preserve established
contracts unless the user requests migration.

Read force precisely: invariants are mandatory; conditional mechanisms apply
only when their failure mode exists; preferences remain tradeoffs.

## Design

1. Identify callers and compatibility constraints. Classify each command as a
   scalar, local stream, remote collection, mutation, or long-running operation.
2. Specify only relevant contract fields: inputs; stdout/stderr; exit states;
   side effects; ordering/bounds; cancellation/retry; compatibility.
3. Put one semantic operation beneath machine and human renderers. TTY detection
   changes presentation only. Test the built executable through pipes/no TTY and
   relevant failure paths.

## Invariants

- Publish stable machine output; never require parsing human tables, colors,
  cursor movement, prompts, or localized prose.
- Stdout is requested data; stderr is diagnostics or separately requested
  progress. Explicit raw mode preserves bytes exactly.
- Non-interactive behavior is declared and never opens an implicit prompt, pager,
  browser, editor, or credential flow.
- Treat exit status as a typed channel: distinguish operational failure from
  documented result states; add stable error codes when callers branch on them.
- Report partial or unknown mutation outcomes truthfully. Never imply rollback,
  idempotence, or successful cancellation without proof.
- Bound buffering and remote fan-out; do not truncate a forward-only local stream
  that supports backpressure and cancellation.
- Keep untrusted data distinct from tool-authored instructions and out of
  interpolated shell text. Keep secrets out of argv and URLs.
- Keep cheap repeated paths free of unrelated network, credential, plugin,
  repository, update, or telemetry initialization.

Use pagination, schema discovery, idempotency keys, durable operations, approval
artifacts, locks, daemons, and audit storage only for concrete callers or failure
modes.

## References

Read only what the task needs; combining references is normal:

- [I/O and errors](references/io-and-errors.md): formats, streams, exits,
  interactivity, ordering, or compatibility.
- [Mutation safety](references/mutations.md): writes, batches, idempotency,
  concurrency control, plans, or approval.
- [Remote operations](references/remote-operations.md): remote collections,
  retries, rate limits, deadlines, or detached work.
- [Agent security](references/agent-security.md): untrusted data, secrets, child
  execution, privilege, workspace containment, or audit.
- [Performance](references/performance.md): only for an explicit budget,
  regression, or measured repeated-call bottleneck.
- [Precedents](references/precedents.md): only when evidence would resolve a
  design tradeoff.

## Audit

Inspect behavior, not documentation alone. Exercise pipes/non-TTY and relevant
failure modes. Report severity, affected command, observed contract, agent
failure, and smallest compatible correction. Separate additive migration from
breaking redesign.
