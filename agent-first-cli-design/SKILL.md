---
name: agent-first-cli-design
description: Design or audit stable CLI contracts for agents and automation. Use when the task centers on machine-readable I/O, non-interactive execution, streaming or bulk behavior, remote mutations, retries, or agent-specific safety. Do not load for ordinary help-text changes, internal implementation, or one-off shell use unless those contract concerns are central.
---

# Agent-First CLI Design

## Premise

Treat a maintained CLI as a programmatic contract carried over arguments, stdin,
stdout, stderr, and exit status. Design that contract first; human rendering is a
second presentation of the same semantics.

Agents pay repeatedly for process startup, output admitted to context, ambiguous
state, and recovery calls. Optimize the observe-decide-invoke loop, while keeping
the human interface clear and preserving established compatibility.

Interpret modal language precisely:

- **Must** marks an interoperability, correctness, or safety invariant.
- **Apply when relevant** marks a mechanism whose failure mode is present.
- **Prefer** marks a tradeoff, not a universal rule.

## Workflow

1. Identify callers and compatibility constraints. Classify each command as a
   scalar result, local stream, materialized/remote collection, mutation, or
   long-running operation.
2. Define the observable contract before presentation:

   ```text
   command | inputs | stdout/stderr | exit states | side effects
           | ordering/bounds | cancellation/retry | compatibility
   ```

   Keep only columns relevant to the command.
3. Implement one semantic operation beneath machine and human renderers. TTY
   detection may select presentation, never targets, permissions, or side
   effects.
4. Verify the built executable with pipes and no TTY. Benchmark only when a
   product budget, regression-sensitive path, or repeated-agent workload makes
   performance material; establish a baseline before proposing numeric gates.

## Invariants

- Machine output is a documented public interface. Never require agents to parse
  human tables, colors, cursor movement, prompts, or localized prose.
- Stdout carries requested results; stderr carries diagnostics and separately
  requested progress. Explicit raw-payload mode preserves bytes exactly.
- Interaction is declared. A non-interactive invocation never opens a pager,
  browser, editor, credential flow, or undeclared stdin prompt.
- Exit status is a small typed channel. Keep operational failure distinguishable
  from documented result states, and expose stable machine error codes when
  callers need richer branching.
- Mutations report truthful outcomes, including partial or unknown application.
  Never imply rollback, idempotence, or successful cancellation without proof.
- Bound work that buffers results or can fan out into unbounded remote requests.
  A local forward-only stream may be exhaustive by default when it supports
  backpressure and cancellation.
- Never interpolate untrusted values into a shell command. Keep untrusted domain
  data structurally distinct from tool-authored diagnostics or suggested action.
- Keep cheap, repeated paths free of unrelated network, credential, plugin,
  repository, update, or telemetry initialization.

Do not add pagination, schema-discovery commands, idempotency keys, durable
operations, approval artifacts, locks, daemons, or audit storage without a
concrete caller or failure mode.

## References

Read only what the task needs:

- [I/O and errors](references/io-and-errors.md): public input/output formats,
  streams, exit states, interactivity, ordering, or compatibility.
- [Stateful and remote commands](references/stateful-and-remote.md): remote
  collections, mutations, retries, concurrency, bulk work, or detached work.
- [Agent security](references/agent-security.md): untrusted output, secrets,
  child execution, privilege boundaries, or delegated approval.
- [Performance](references/performance.md): only when performance is requested,
  budgeted, regressing, or measured as a repeated-invocation bottleneck.
- [Precedents](references/precedents.md): only when examples or evidence would
  improve a disputed design choice.

## Review Mode

Inspect observed behavior, not documentation alone. Exercise representative
commands through pipes/non-TTY and relevant failure modes. Report findings by
severity with the affected command, observed contract, agent failure, and the
smallest compatible correction. Separate additive migrations from breaking
redesigns.
