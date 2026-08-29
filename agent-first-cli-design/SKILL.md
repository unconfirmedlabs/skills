---
name: agent-first-cli-design
description: Design, implement, or review maintained command-line interfaces for autonomous agents and automation. Use when defining or changing CLI commands, flags, machine-readable output, errors, performance, reliability, or safety; not for one-off private shell commands.
---

# Agent-First CLI Design

## Stance

Treat the CLI as a versioned local API transported over `argv`, stdin, stdout,
stderr, and exit status. Build the machine contract first; put the human
experience on top of the same operations as a presentation layer.

Agents and humans pay different costs. Humans pay for typing, memorization, and
visual scanning. Agents pay for process startup on every call, bytes admitted to
context, ambiguous state, recovery turns, and unsafe retries. Optimize the full
observe-decide-invoke loop rather than minimizing keystrokes.

Keep the human interface excellent, but never make rich terminal output,
interactive prompting, or prose documentation the only way to use a feature.

Scale the design to the actual tool. A local read-only filter does not need
idempotency keys; a one-command private utility may not need schema discovery.
Apply a mechanism when its associated failure mode exists.

## Design Workflow

1. Establish the compatibility boundary. For a greenfield agent-first CLI,
   prefer machine-safe defaults. For an established CLI, preserve documented
   behavior and add an explicit automation surface with a migration path.
2. Inventory public commands before implementation. For each command, record:

   ```text
   command | side effect and risk | inputs | result schema | ordering/paging
           | idempotency/retry | timeout/cancel | latency/output budget
   ```

3. Design the machine contract, including failures and partial success, before
   designing tables, colors, prompts, spinners, or tutorials.
4. Implement the domain operation separately from argument parsing and human
   rendering. Both machine and human modes must call the same semantics.
5. Test the public contract through the built executable with pipes and no TTY.
   Benchmark cold and warm invocations in addition to testing correctness. If
   no product budget or baseline exists, define the measurement plan and label
   proposed numbers as hypotheses; do not invent release gates.

## Core Contract

Unless compatibility constraints require otherwise:

- For a new agent-primary tool, default to an unambiguous result format: JSON
  for bounded structured values, JSONL for streams, and raw text or bytes for a
  true scalar or file payload. Offer rich output explicitly, such as
  `--output human`. An established CLI may instead add `--output json` while
  retaining its old default.
- Treat structured output as a public API. Publish its semantics and schema;
  version it when independent evolution is necessary. Human output is not a
  parsing surface and may evolve.
- Reserve stdout for the requested result. Send diagnostics and optional
  progress to stderr. Never mix banners, update notices, prompts, ANSI control
  sequences, or debug logs into machine results.
- Exit `0` only when the command's stated contract is fully satisfied. On
  failure, return nonzero and a stable machine error code; do not make callers
  branch on prose. Represent partial success explicitly and return nonzero.
- Provide a global non-interactive guarantee. In that mode, never prompt,
  launch a browser/editor/pager, allocate a TTY, or wait for input that was not
  declared. TTY detection may change presentation, never operation semantics,
  targets, permissions, or safety policy.
- Make growing work bounded. Lists need limits and pagination; traversal needs
  depth/count/byte bounds; networks need deadlines and finite retries; workers
  and output need caps. Exhaustive behavior must be explicit.
- Expose resolved context before side effects: workspace, account, endpoint,
  project/region, configuration sources, target identifiers, and tool/protocol
  version as applicable. Ambient context is convenience, not authority.
- Make startup and time-to-first-result product features. Keep `--help`,
  `--version`, capability discovery, validation, and narrow local reads free of
  unrelated network, update, plugin, repository, or credential initialization.
- Treat arguments, filenames, repository content, remote text, config, plugins,
  child-process output, and environment variables as untrusted. Never construct
  a shell command from them.
- Keep command names, flags, defaults, output fields, ordering, error codes,
  environment variables, and config precedence compatible or formally
  deprecated. The automation surface is broader than the JSON shape.

Read [references/machine-contract.md](references/machine-contract.md) when
designing command grammar, formats, errors, pagination, mutation semantics,
batching, asynchronous operations, discovery, or versioning.

## Add Capabilities Where the Risk Exists

| Situation | Agent-grade capability |
| --- | --- |
| Potentially growing list | Filter and field projection, bounded `--limit`, opaque cursor, documented total order, explicit `--all` |
| Stateful mutation | Exact targets, plan or faithful dry run, idempotency or reconciliation, optimistic concurrency, explicit final state |
| Bulk mutation | Declared atomicity, per-item results, terminal summary, deterministic retry set |
| Long-running work | Operation ID plus bounded `status`, `wait`, and `cancel`; typed progress events if streamed |
| Arbitrary filenames | `--` option delimiter and JSON arrays or NUL-delimited records; never newline parsing |
| Large structured input | File or declared stdin input; batch JSON/JSONL rather than fragile shell quoting |
| Child processes | Direct executable plus argv array, concurrent pipe draining, signal propagation, bounded capture |
| Remote service | Explicit endpoint/API version, resolved principal and scope, consistency model, rate-limit/retry metadata, and operation/result retention |
| Evolving public integration | Machine-readable capabilities and input/output schemas with explicit supported versions |
| Secrets | Credential handles, OS stores, or file descriptors/files with permission checks; never ordinary argv |
| Destructive or privileged work | Canonical action manifest and scope-bound approval; a bare `--force` is not authority |
| Shared workspace or multiple agents | Expected revision, locks or leases where needed, conflict detection, and auditable run IDs |

Read [references/performance-and-reliability.md](references/performance-and-reliability.md)
for startup paths, batching, streaming, caching, daemons, retries, cancellation,
resource bounds, and reproducible benchmarks.

Read [references/security.md](references/security.md) when the CLI acts on
untrusted paths/content, loads config or plugins, handles secrets, invokes other
programs, mutates shared state, extracts archives, or performs privileged or
destructive work.

## Review Existing CLIs

Inspect implementation and observed behavior, not documentation alone. Exercise
representative commands with stdin/stdout/stderr piped, an empty environment or
explicit config, hostile operands, failure injection, cancellation, and
concurrent calls. Measure startup and first-result latency.

Report findings in severity order. For each finding, name the affected command,
show the observed contract, explain the agent failure it creates, and propose the
smallest compatible correction. Separate breaking redesigns from additive
migration paths.

Use [references/exemplars.md](references/exemplars.md) when precedent or tradeoff
evidence would improve the design. Borrow contracts, not surface fashion.

## Completion Criteria

Before calling a maintained CLI agent-ready, verify the relevant invariants:

- Machine output and error schemas have contract tests; unknown and added fields
  have a documented compatibility policy.
- Piped/non-TTY execution is deterministic, non-interactive, and free of terminal
  control sequences.
- Failure, partial success, timeout, cancellation, retry, and unknown mutation
  outcome are distinguishable without parsing prose.
- Commands are bounded and cancellable where work can grow or block.
- Secrets and untrusted values do not leak through argv, logs, errors, telemetry,
  generated commands, or human rendering.
- Cold/warm startup, time to first record, completion latency, output volume, and
  resource use are benchmarked against explicit product budgets.
- `--help` remains concise and useful to a human, while an agent can discover the
  maintained contract without scraping it.
