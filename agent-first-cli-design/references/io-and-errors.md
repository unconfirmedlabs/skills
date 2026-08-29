# I/O and Error Contracts

Read this reference when defining public arguments, result formats, streams,
errors, exit states, interactivity, ordering, or compatibility.

## Choose a Lossless Form

| Result | Usual machine form |
| --- | --- |
| Bounded structured value | One UTF-8 JSON document |
| Forward-only records or events | JSONL, JSON Text Sequences, or domain framing |
| True scalar | Raw text with one trailing newline |
| File or byte payload | Exact raw bytes |
| Arbitrary Unix pathname bytes | NUL-delimited bytes or an explicit byte encoding |

JSON arrays are safe for paths only when the CLI defines a Unicode/UTF-8 pathname
model. Do not force every success into an envelope; add metadata such as cursors,
snapshots, warnings, or request IDs only when callers use it.

For structured fields, define names, types, units, null/absent behavior, timestamp
format, enum evolution, truncation, and array ordering. Avoid localized or
relative values in machine fields. Offer filtering or field projection when it
materially reduces runtime, transfer, or agent context.

## Keep Streams Simple

Use the lightest stream contract that supports recovery:

- A simple process stream needs self-contained framing plus documented EOF and
  exit semantics. It does not need an operation ID, sequence number, or terminal
  record merely because it is streamed.
- A resumable, multiplexed, or remotely durable stream may need operation IDs,
  sequence/resume tokens, and explicit terminal outcomes. Read
  [stateful-and-remote.md](stateful-and-remote.md) for that case.

Flush complete records promptly and respect pipe backpressure. If failure occurs
before any result, keep stdout empty and write the diagnostic to stderr. After
streaming begins, preserve emitted records, exit nonzero for operational failure,
and emit an in-band failure or partial summary only when the stdout protocol
defines one.

Structured progress belongs on stderr unless stdout is explicitly a unified
result/event stream. For example, `--progress=json` may mean JSONL on stderr;
document the channel rather than relying on the flag name.

## Separate Results, Diagnostics, and Rendering

Stdout contains requested results. Stderr contains diagnostics and independently
requested progress. Human renderers may add color and layout; machine renderers
must not introduce terminal controls. Structured text encodes untrusted control
characters. Explicit raw-payload mode is exempt and must preserve bytes exactly.

If any command can interact, provide a global non-interactive guarantee. A CLI
that is always non-interactive need not add a redundant flag. Never use TTY
detection to change selected resources, amount of work, validation, authority, or
side effects. Declare stdin's role; do not reuse it for both data and prompts.

## Treat Exit Status as a Typed Channel

Use `0` for the primary success state. Predicate and comparison commands may
define documented non-error statuses, as `diff` and `test` do. Keep usage and
operational failures distinguishable from those result states.

When callers need richer branching, provide stable error codes in a structured
stderr format. Human messages and hints may evolve; codes and behavioral fields
do not. State retryability only when defensible. For partial batches, report each
item as succeeded, failed, skipped, or unknown, then use an exit state consistent
with the documented batch contract.

## Preserve Compatibility

The programmatic interface includes command and flag names, defaults, accepted
inputs, output schemas, ordering, exit states, environment/config precedence,
and side-effect semantics. Evolve or deprecate them deliberately.

Support `--help`, `--version`, long flag names, and `--` before arbitrary
operands. Reject unknown or conflicting inputs instead of guessing. Add machine
capability or schema-discovery commands only for a concrete dynamic consumer, and
generate them from the same source as parsing and documentation to prevent drift.

## Sources

- [POSIX.1-2024 utility conventions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
- [POSIX `diff` exit states](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/diff.html)
- [GNU command-line interface standards](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html)
- [CLI Guidelines](https://clig.dev/)
- [RFC 7464: JSON Text Sequences](https://www.rfc-editor.org/rfc/rfc7464.html)
- [Cargo external-tool messages](https://doc.rust-lang.org/cargo/reference/external-tools.html)
