# Machine Contract

Use this reference to design the public automation surface. It is a set of
decision rules, not a requirement that every CLI implement every feature.

## 1. Command Grammar and Inputs

Prefer a regular grammar such as `tool <resource> <verb>` or `tool <verb>
<resource>` and use the same verbs across resources. Use positional operands for
the primary, unambiguous subject and named flags for optional behavior. Publish
long flag names; do not require abbreviations or rely on prefix matching.

Support `--` before arbitrary operands. Accept repeated flags, an input file, or
a declared stdin mode for lists and large requests. Do not make stdin both data
and confirmation. A useful pattern is `--input <path|->`, where `-` explicitly
selects stdin.

Keep operation semantics independent of flag order where the parser allows it.
Reject unknown flags and conflicting inputs instead of guessing. Echo the
normalized, non-secret request in a plan or structured diagnostic when that aids
verification.

## 2. Result Formats

Choose the narrowest lossless format:

| Result | Preferred machine form |
| --- | --- |
| Bounded object or collection | One UTF-8 JSON document |
| Incremental or unbounded events | JSONL, or RFC 7464 JSON Text Sequences when explicit framing is needed |
| A true scalar | Raw text with one trailing newline |
| A file or byte stream | Raw bytes, with metadata requested separately |
| Arbitrary paths | JSON array or NUL-delimited bytes |

Do not force every success into a generic envelope. A domain object is often the
most composable result. Use an envelope when the caller needs metadata, for
example:

```json
{
  "schema_version": "1.0",
  "items": [{"id": "item_123", "state": "ready"}],
  "meta": {
    "next_cursor": null,
    "snapshot": "rev_456",
    "request_id": "req_789"
  }
}
```

For machine fields:

- Use stable names, types, enum meanings, units, and null/absent semantics.
- Use absolute timestamps with timezone and machine units named in the field,
  not relative phrases such as `yesterday` or ambiguous values such as
  `duration: 5`.
- Do not localize identifiers, enum values, numbers, or timestamps.
- Define ordering. JSON object key order is not semantic; array order often is.
- Mark truncated fields and give a way to retrieve the complete value by ID,
  digest, cursor, or artifact path.
- Never place instructions derived from remote or repository content in trusted
  `message`, `hint`, or `suggested_command` fields.

Offer field projection and filtering when results can be large. Filtering at the
source saves runtime, network transfer, serialization, and agent context.

## 3. Streams and Progress

A stream consists of typed, independently parseable records. Include an
operation ID, monotonically increasing sequence number, event type, and a final
`completed`, `failed`, or `cancelled` record. Flush complete records promptly.

```json
{"type":"started","operation_id":"op_123","sequence":1}
{"type":"item","operation_id":"op_123","sequence":2,"item":{"id":"a"}}
{"type":"completed","operation_id":"op_123","sequence":3,"summary":{"succeeded":1,"failed":0}}
```

A missing terminal record means the stream was truncated or its outcome is
unknown; it must not be interpreted as success. Keep human spinners, cursor
movement, and redraws out of machine mode. If progress is useful to automation,
offer typed progress events explicitly rather than mixing them with result
records.

## 4. Errors and Exit Status

Exit `0` only for full fulfillment. Use nonzero for usage errors, operational
failure, cancellation, and any partial failure not explicitly defined as the
command's successful result. Keep the numeric taxonomy small and documented;
use a stable string error code as the primary branching surface.

On whole-command failure, leave result stdout empty and emit a structured error
to stderr in machine mode:

```json
{
  "error": {
    "code": "RESOURCE_CONFLICT",
    "category": "CONFLICT",
    "message": "The resource changed after the plan was created.",
    "retryable": false,
    "outcome": "not_applied",
    "details": {"resource_id": "item_123", "expected_revision": "7", "actual_revision": "8"},
    "request_id": "req_789"
  }
}
```

Use durable categories such as `USAGE`, `VALIDATION`, `AUTHENTICATION`,
`AUTHORIZATION`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `TEMPORARY`, `TIMEOUT`,
`CANCELLED`, `PARTIAL_FAILURE`, and `INTERNAL`. Add command-specific string codes
under those categories.

The `outcome` of a failed mutation is distinct from its transport failure:

- `not_applied`: safe to correct or retry.
- `applied`: the requested state was committed even though later reporting
  failed.
- `unknown`: reconcile by idempotency key, operation ID, or a read before any
  retry.

Include `retryable` and `retry_after_ms` only when the tool can defend them. A
timeout does not prove that a remote mutation was not applied.

For best-effort batches, write one result for every requested item, including
`succeeded`, `failed`, `skipped`, or `unknown`, then a terminal summary. Exit
nonzero if any item failed or is unknown. State whether output order follows
request order, a stable sort key, or completion order.

## 5. Non-Interactive and Human Modes

Provide one global guarantee such as `--non-interactive` or `--no-input`. It
means no prompt, browser, editor, pager, credential device flow, TTY allocation,
animation, or undeclared stdin read. Missing required input fails immediately
and identifies the exact flag, file, or credential mechanism needed.

Define controls consistently across commands where relevant:

```text
--output json|jsonl|raw|human
--error-format json|human
--color auto|always|never
--progress auto|plain|json|none
--non-interactive
```

Machine output should imply no color and no terminal control sequences. TTY
detection may choose a human renderer only when that behavior is part of a
documented compatibility mode; it must not change the selected target, amount of
work, validation, authorization, or side effects.

## 6. Lists, Pagination, and Determinism

Paginate any list that can grow. Prefer bounded defaults with `--limit` and an
opaque cursor. Return a continuation token and, when consistency matters, the
snapshot or read revision. Make exhaustive retrieval explicit with `--all`, and
still enforce a configurable safety cap.

Define a stable total order, including a tie-breaker. If deterministic sorting
would materially reduce streaming throughput, make the tradeoff explicit with a
mode such as `--order stable|completion`; do not silently vary order according to
thread timing.

Changing default page size, default ordering, or whether a command fetches all
pages can change agent decisions and is a compatibility change.

## 7. Mutations and Approval

Prefer declarative convergence (`apply`, `ensure`, or an equivalent operation)
when it matches the domain. Return `created`, `updated`, `unchanged`, or a more
precise final state plus stable identifiers and revision.

For stateful writes:

- Support a plan or dry run. Distinguish client-only validation from an
  authoritative server-side preview that exercises permissions, policy, and
  conflict checks.
- Provide natural idempotence or an idempotency key for create-like work. The
  same key and canonical request returns the original result; the same key with
  different input is a conflict.
- Accept an expected revision, digest, or ETag when another actor can change the
  target.
- Bind destructive approval to the canonical action, exact target IDs and
  count, account/project/region, expected revision, expiry, and nonce. A generic
  `--yes` or `--force` may acknowledge ergonomics; it does not grant authority.
- Say whether a batch is atomic or best-effort and provide deterministic
  recovery for partial application.

Do not describe a weak client-side preview as proof that execution will succeed.
Do not automatically retry a non-idempotent write after a transport error.

## 8. Long-Running Operations and Cancellation

When work outlives a reasonable invocation, create a durable operation and
return its ID quickly. Provide bounded, non-interactive operations equivalent to:

```text
tool operation get <id>
tool operation wait <id> --timeout <duration>
tool operation cancel <id>
```

Cancellation is a requested state transition, not proof of rollback. Report
whether work stopped, completed, partially applied, or remains unknown. Propagate
signals to children and remote work where possible.

## 9. Discovery and Compatibility

Keep `--help` and `--version` fast, offline, and useful to humans. For a broad or
evolving public CLI, add zero-side-effect machine discovery, for example:

```text
tool version --output json
tool capabilities --output json
tool schema output@1
tool schema request.resource.apply@1
```

Capabilities may describe supported commands, formats, schema URIs, input
modes, side-effect/risk class, auth methods, required permissions, pagination,
idempotency, retry, cancellation, and deprecations. It describes capabilities,
not ambient credentials.

For a remote-service CLI, also make endpoint and API-version selection,
authenticated principal and scope, consistency/snapshot behavior, server
idempotency, rate-limit and retry metadata, and operation/result retention
observable. Do not let the CLI promise stronger semantics than the service.

Version the binary, command semantics, and data schemas deliberately. Adding an
optional field can be compatible; changing a field's type or meaning, an enum's
fallback behavior, a default target, ordering, exit semantics, or config
precedence can be breaking. Consumers should ignore unknown fields and treat
unknown enum values as unsupported rather than guessing.

## Sources

- [POSIX.1-2024 utility conventions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
- [POSIX.1-2024 utility description defaults](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap01.html)
- [GNU command-line interface standards](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html)
- [Command Line Interface Guidelines](https://clig.dev/)
- [JSON Schema specification](https://json-schema.org/specification)
- [RFC 7464: JSON Text Sequences](https://www.rfc-editor.org/rfc/rfc7464.html)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Google AIP-158: Pagination](https://google.aip.dev/158)
- [Google AIP-194: Automatic retry](https://google.aip.dev/194)
- [Google long-running operations](https://github.com/googleapis/googleapis/blob/master/google/longrunning/longrunning.yaml)
