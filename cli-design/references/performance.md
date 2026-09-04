# Performance

Agents amplify fixed invocation cost:

```text
task floor ~= dependent calls * startup cost
```

## Measure the Agent Loop

Measure startup, time to first useful record, total time, output bytes/records,
and peak memory. Separate runtime startup, config/project discovery,
authentication/cache setup, network/service time, and
serialization/backpressure. Measure cold and warm states independently.

Do not copy another tool's millisecond number into a release gate. Establish a
baseline on supported hardware and representative inputs; treat a proposed
budget as a hypothesis until the product accepts it.

## Shorten Repeated Paths

Keep help, version, syntax validation, and narrow local reads free of unrelated
update checks, telemetry, network, credential refresh, broad scans, plugin
loading, and subprocess startup.

Batch repeated calls or support repeated operands, filters, and projection when
this removes material startup or network round trips. Preserve per-item outcomes,
streaming first results, cancellation, and narrow recovery. One opaque giant
batch is not automatically faster at task level.

Drain child stdout and stderr concurrently. Bound buffers, queues, concurrency,
and remote fan-out where they can grow; do not cap a forward-only local stream
merely to reduce output. Make stable-order versus completion-order costs explicit.

Use caches or a daemon only after measurement shows initialization dominates.
Account for lifecycle, isolation, stale context, protocol versioning, and
cancellation; prefer one-shot execution for rare or privileged work.

## Benchmark the Contract

Use the built executable and fixed fixtures. Cover the relevant subset:

- help/version and invalid input;
- a narrow command and representative workload;
- first record and sustained streaming;
- cold/warm cache or controlled network state;
- cancellation, concurrency, and output limits.

Record revision, OS/hardware/filesystem, environment/config, fixture digest,
cache state, and semantic scope. Retain raw samples; report percentiles only when
sample count supports them. Gate product-relevant metrics, not every CLI change.
