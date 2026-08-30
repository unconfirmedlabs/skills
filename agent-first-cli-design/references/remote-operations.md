# Remote Collections and Operations

## Collections

Bound calls that can fan out into many requests or materialize large responses.
Use limits and opaque cursors only when the source has a meaningful continuation
model. Define ordering, cursor lifetime, and snapshot/consistency semantics; do
not bolt pagination onto a changing local stream.

Make exhaustive retrieval explicit when its cost surprises, with a safety ceiling
where appropriate. Prefer source-side filters and field projection. Changing
default order, page size, or whether all pages are fetched is a behavioral
compatibility change.

## Retries, Deadlines, and Rate Limits

Use bounded retry with backoff and jitter only for retryable, idempotent work;
honor `Retry-After` and provider rate-limit metadata. Bound connect and idle/read
waits at external boundaries. A healthy foreground task needs no universal total
timeout; expose a deadline when callers need one.

Define whether a retry count includes the first attempt. For retried mutations,
test both a retryable failure before application and a lost response after
application, asserting attempt bounds and idempotent replay of the original
result.

Define deadline scope across connect/read waits, retries, backoff, and polling.
Clamp work to the remaining budget or state the possible overrun; a poll-loop
flag alone is not necessarily an end-to-end deadline.

Coordinate concurrency and retries within an invocation to avoid retry storms.
Document result order when parallel work completes nondeterministically.

## Long-Running Work

Prefer a foreground process with signals for ordinary local work. Add a durable
operation ID plus bounded `get`, `wait`, or `cancel` only when work lives remotely,
must survive the client, or explicitly supports detach/resume.

Cancellation is a request, not proof of rollback. Report stopped, completed,
partially applied, or unknown state. Never promise stronger semantics than the
service provides.
