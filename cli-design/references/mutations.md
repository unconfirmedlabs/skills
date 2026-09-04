# Mutation Safety

## Report What Happened

Return stable target identifiers and resulting state when known. Otherwise
return any available operation or reconciliation handle and explicitly mark
state or effect unknown. On failure, distinguish:

- `not_applied`: safe to correct or retry;
- `applied`: committed despite later reporting failure;
- `unknown`: reconcile by read, idempotency key, or operation ID before retrying.

A timeout or lost connection does not prove a write was not applied. Do not
automatically retry unless repeated execution is known safe.

## Match Mechanisms to Failure Modes

- Prefer natural idempotence. Add an idempotency key when duplicate execution is
  possible; the same key with different canonical input must conflict.
- When practical, make the applied request identity observable through the
  result, resource, or operation lookup. Reconcile a lost response by exact
  request identity or authoritative operation state; matching desired state
  alone does not prove which request applied.
- Use expected revisions, digests, or ETags when another actor can change state.
- Offer a plan or dry run for consequential, bulk, or hard-to-reverse work. State
  whether it is client validation or an authoritative server preview.
- Declare batch atomicity. For best effort, return per-item outcomes and a
  deterministic recovery/retry set. Never claim rollback the backend cannot
  provide.

For streamed mutation input, declare whether validation is per record or a
whole-input preflight. If every input must validate before any effect, use a
bounded manifest, spool, or plan; do not imply an unbounded stream can be
prevalidated for free.

Plans should contain exact targets, resolved context, proposed changes, warnings,
and a stable action digest when later verification needs one. Keep preview and
execution semantics aligned; stale plans must fail safely when concurrency
matters.

## Separate Authority, Confirmation, and Approval

- **Authorization** comes from OS/service identity and policy.
- **Confirmation** is caller acknowledgement such as `--yes` or a typed target.
- **Bound approval** crosses an approver or policy boundary.

Use bound approval only for high-impact delegated or cross-principal work. Define
issuer, verifier, canonical action digest, exact targets/context, expiry, and
replay behavior. A plan or manifest is not authority by itself.

For consequential remote writes, expose effective endpoint/API version,
principal and scope, project/region, and resolved target before or in the result.
Avoid dumping irrelevant ambient context on harmless operations.
