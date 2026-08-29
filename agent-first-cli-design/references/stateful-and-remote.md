# Stateful and Remote Commands

Read this reference for remote collections, mutations, concurrency, retries,
bulk work, or work that may survive the invoking process.

## Remote Collections

Bound calls that can fan out into many requests or materialize large responses.
Use limits and opaque cursors only when the data source supports a meaningful
continuation model. Define ordering, cursor lifetime, and snapshot/consistency
semantics; do not bolt pagination onto a changing local stream.

Make exhaustive remote retrieval explicit when it has surprising cost, and keep
a safety ceiling where appropriate. Prefer source-side filters and field
projection. Changing default ordering, page size, or whether all pages are
fetched can be a breaking behavioral change.

## Mutations

Return stable target identifiers and the resulting state. On failure, distinguish:

- `not_applied`: safe to correct or retry;
- `applied`: committed despite later reporting failure;
- `unknown`: reconcile by read, idempotency key, or operation ID before retrying.

Apply mechanisms only when their failure mode exists:

- Use natural idempotence or an idempotency key when duplicate execution is
  possible. The same key with different canonical input must conflict.
- Use expected revisions, digests, or ETags when another actor can change state.
- Offer a plan or dry run for high-impact, bulk, or hard-to-reverse work. Say
  whether it is client validation or an authoritative server preview.
- Declare batch atomicity. For best effort, return per-item outcomes and a
  deterministic recovery set; never claim rollback the backend cannot provide.

Do not automatically retry a write unless repeated execution is known safe. A
timeout or lost connection does not prove that a mutation was not applied.

## Authorization, Confirmation, and Approval

Keep these concepts separate:

- **Authorization** comes from OS/service identity and policy.
- **Confirmation** is caller acknowledgement such as `--yes` or a typed target.
- **Bound approval** is an artifact from a separate approver or policy boundary.

Use bound approval only for high-impact delegated or cross-principal work. Define
its issuer, verifier, canonical action digest, exact targets and context, expiry,
and replay behavior. A plan or manifest is not authority by itself.

## Retries, Timeouts, and Rate Limits

Use bounded retry with backoff and jitter only for retryable, idempotent work;
honor provider `Retry-After` and rate-limit metadata. Bound connect and idle/read
waits at external boundaries. A universal finite total timeout is not required
for a healthy foreground task; expose one when callers need a deadline.

Coordinate concurrency and retries within an invocation to avoid retry storms.
Document result order when parallel work can complete nondeterministically.

## Long-Running Work

Prefer a foreground process with signals for ordinary local work. Add a durable
operation ID plus bounded `get`, `wait`, or `cancel` only when work already lives
remotely, must survive the client, or explicitly supports detach/resume.

Cancellation is a request, not proof of rollback. Report whether work stopped,
completed, partially applied, or remains unknown. Do not let the CLI promise
stronger semantics than its service.

For consequential remote mutations, make effective endpoint/API version,
principal and scope, project/region, and resolved target visible before or in the
result. Avoid dumping irrelevant ambient context on every harmless read.

## Sources

- [Google AIP-158: Pagination](https://google.aip.dev/158)
- [Google AIP-194: Automatic retry](https://google.aip.dev/194)
- [RFC 9110: Idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)
- [Google long-running operations](https://github.com/googleapis/googleapis/blob/master/google/longrunning/longrunning.yaml)
- [kubectl apply](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/)
- [AWS CLI pagination](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html)
