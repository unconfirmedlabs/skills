# Performance

Read this reference only when performance is requested, budgeted, regressing, or
measured as a bottleneck in repeated agent use.

## Optimize the Agent Loop

Dependent calls repeatedly pay fixed cost:

```text
task floor ~= dependent calls * startup cost
```

Measure startup, time to first useful record, total time, output bytes/records,
and peak memory. Separate process/runtime startup, config/project discovery,
authentication/cache setup, network/service time, and serialization/backpressure.
Measure cold and warm states independently.

Do not copy another tool's millisecond number into a release gate. Establish a
baseline on supported hardware and representative inputs; propose new budgets as
hypotheses until product owners accept them.

## Shorten Repeated Paths

Keep `--help`, `--version`, syntax validation, and narrow local reads free of
unrelated update checks, telemetry, network, credential refresh, broad repository
scans, plugin loading, and subprocess startup.

Batch repeated independent calls or support repeated operands, filters, and field
projection when this removes meaningful startup or network round trips. Preserve
per-item outcomes, streaming first results, cancellation, and narrow recovery;
one opaque giant batch is not automatically faster at the task level.

Drain child stdout and stderr concurrently. Bound buffers, queues, concurrency,
and remote fan-out where they can grow; do not cap a forward-only local stream
merely to make its output smaller. Make stable-order versus completion-order
tradeoffs explicit when parallelism matters.

Use caches or a daemon only after measurement shows initialization dominates. A
daemon also creates lifecycle, isolation, stale-context, protocol-version, and
cancellation costs; prefer one-shot execution for rare or privileged work.

## Benchmark the Contract

Use direct execution and fixed fixtures. Cover the relevant subset of:

- `--help`/`--version` and invalid input;
- a narrow command and a representative workload;
- first record and sustained stream behavior;
- cold/warm cache or controlled network state;
- cancellation, concurrency, and output limits.

Record executable revision, OS/hardware/filesystem, environment/config, fixture
digest, cache state, and semantic scope. Retain raw samples; report percentiles
only when the sample count supports them. Gate the metrics that matter to the
product rather than benchmarking every CLI change.

## Sources

- [CLI Guidelines: responsiveness](https://clig.dev/#robustness)
- [Hyperfine measurement guidance](https://github.com/sharkdp/hyperfine#intermediate-shell)
- [ripgrep benchmark caveats](https://github.com/BurntSushi/ripgrep#is-it-really-faster-than-everything-else)
- [uv benchmarking workflow](https://docs.astral.sh/uv/reference/contributing/#benchmarks)
- [Node child-process pipe behavior](https://nodejs.org/api/child_process.html#child-process)
