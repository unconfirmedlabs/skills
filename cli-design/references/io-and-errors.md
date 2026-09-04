# I/O and Error Contracts

## Choose a Lossless Form

| Result | Usual machine form |
| --- | --- |
| Bounded structured value | One UTF-8 JSON document |
| Forward-only records or events | JSONL, JSON Text Sequences, or domain framing |
| True scalar | Raw text with one trailing newline |
| File or byte payload | Exact raw bytes |
| Arbitrary Unix pathname bytes | NUL framing or explicit byte encoding |

JSON paths require an explicit Unicode/UTF-8 path model. Do not envelope every
success; add cursors, snapshots, warnings, or request IDs only when callers use
them. Define field names, types, units, null/absent behavior, timestamps, enum
evolution, truncation, and ordering. Avoid localized or relative machine values.
Offer filtering or projection when it materially reduces work, transfer, or
agent context.

## Keep Streams as Simple as Recovery Allows

- A process stream needs self-contained framing plus documented EOF and exit
  semantics. Streaming alone does not require an operation ID, sequence number,
  or terminal record.
- A resumable, multiplexed, or remotely durable stream may require operation IDs,
  sequence/resume tokens, and explicit terminal outcomes. Read
  [remote-operations.md](remote-operations.md).

Flush complete records promptly and honor pipe backpressure. Before the first
result, an error leaves stdout empty and uses stderr. After output begins,
preserve emitted records. If an operational error occurs, exit nonzero; put an
error or partial summary in-band only when the stdout protocol defines it.

Treat downstream pipe closure as cancellation: stop upstream reads and remote
pagination promptly, suppress runtime broken-pipe tracebacks, and document
whether the process uses the platform signal status or a clean exit. Test the
built executable with an early-closing no-TTY consumer.

When a ceiling, deadline, or partial failure can stop a stream before source
exhaustion, expose completeness and any recovery token in the defined protocol.
Do not require a terminal record when clean EOF plus exit status is unambiguous.

Structured progress belongs on stderr unless stdout is explicitly a unified
result/event stream. Document its channel and framing rather than relying on a
flag name.

## Separate Data, Diagnostics, and Interaction

Machine rendering introduces no terminal controls and encodes untrusted control
characters. Explicit raw output is exempt, remains exact, and shares no stdout
with diagnostics.

If any command can interact, provide a global non-interactive guarantee. An
always-non-interactive CLI needs no redundant flag. Declare stdin's role; never
reuse it for both data and prompts. TTY detection must not alter selected
resources, amount of work, validation, authority, or side effects.

## Treat Exit Status as a Typed Channel

Use `0` for primary success. Predicate or comparison commands may document other
non-error statuses. Keep usage and operational failure distinct. When callers
need richer branching, emit stable error codes in a documented structured stderr
format; messages may evolve. Claim retryability only when defensible.

For partial batches, report each defined per-item outcome and use an exit state
consistent with the documented batch contract. Completion-order records need
stable caller correlation such as an input index or request key. If the protocol
has a terminal summary, account for every input, including validation failures.

## Preserve Compatibility

The contract includes names, flags, defaults, accepted inputs, output schemas,
ordering, exit states, config/environment precedence, and side effects. Evolve
them deliberately. Offer `--help`, `--version`, long flags, and `--` before
arbitrary operands; reject unknown or conflicting input instead of guessing.
Keep command-specific help local and fast, and state consequential inputs,
defaults, framing, side effects, and exit behavior without requiring network or
authentication. Add capability/schema discovery only for a real dynamic consumer
and derive it from the same source as parsing and documentation.
