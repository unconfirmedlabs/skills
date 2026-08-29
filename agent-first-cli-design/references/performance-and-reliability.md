# Performance and Reliability

## Agent Loop Economics

Agents can issue tens or hundreds of commands without typing delay, but dependent
calls still serialize observe-decide-invoke loops. Fixed invocation cost becomes
a task-level floor:

```text
fixed task latency ~= dependent invocation count * per-process fixed cost
```

Measure and optimize time to first machine-readable record as well as total
completion. Also measure output bytes: a fast command that floods the agent's
context can be slower at the task level than a projected, bounded response.

The human-oriented CLI Guidelines recommend visible feedback within 100 ms. For
an agent, a spinner only proves liveness; the dependency loop advances on a
usable result, a typed event, or an operation ID. One hundred dependent calls at
100 ms of fixed cost already spend 10 seconds before useful work. Treat 100 ms as
context for responsiveness, not as a universal target, and set a tighter budget
when repeated local calls dominate the real workload.

Do not invent one universal millisecond target. Establish budgets on supported
hardware from representative workloads, then prevent regressions. Separate:

- process/runtime startup;
- argument parsing and configuration discovery;
- project/repository or plugin discovery;
- authentication and cache initialization;
- network/service latency;
- serialization and pipe backpressure.

Measure cold and warm states separately. Report p50, p95, and p99 or raw samples,
not only a best run or mean.

When no baseline or product SLO exists, deliver the benchmark matrix first.
Numeric budgets may be proposed as explicitly labeled hypotheses for product
review, not asserted as release gates. A number measured by another tool on
different hardware is evidence about scale, not a transferable SLO.

Small fixed costs are measurable. In one maintainer trace, a typical warm `bat`
run was about 8.5 ms while low-level startup was roughly 2.3 ms; configuration,
argument parsing, syntax-regex compilation, and Git status accounted for most of
the rest. Those values are machine- and workload-specific, but the decomposition
shows why eager project/config work matters even in a native executable.

## Keep the Fast Path Short

`--help`, `--version`, capabilities, schema output, syntax validation, and narrow
local reads should not initialize unrelated subsystems. In particular, avoid:

- synchronous update or telemetry checks;
- network access, credential refresh, or cloud metadata probing;
- scanning parent directories or an entire repository when not needed;
- eagerly loading plugins, command implementations, templates, or large config;
- starting a runtime or shell subprocess for work available in-process.

Parse enough of the command to select its dependencies, then initialize lazily.
Make offline discovery truly offline and test it with network access denied.

## Reduce Calls Without Creating Opaque Monoliths

Support batch input, repeated operands, query filters, field projection, and
server-side selection when an agent would otherwise make many identical calls.
This amortizes startup and network round trips.

Preserve composability:

- Stream per-item results rather than waiting for a giant batch to finish.
- Define atomicity and return per-item failures.
- Allow cancellation and bound request size, item count, and concurrency.
- Keep narrow single-item commands for targeted recovery.

Optimize the number of dependent round trips, not merely the number of command
names.

## Streaming and Pipe Discipline

Flush complete structured records progressively. Drain child stdout and stderr
concurrently; a child can block forever when a full pipe is not read. Do not use
APIs that buffer unbounded output in memory for large or indefinite streams.

Set and report limits for input bytes, output bytes, records, field length,
runtime, idle time, and buffered diagnostics. If a limit is reached, return a
structured limit error with the observed value, cap, partial-result location or
cursor, and operation outcome. Never silently truncate.

Progress is optional and rate-limited. In machine mode it is absent or a typed
event stream. A rapidly redrawn spinner wastes CPU, log volume, and context and
can corrupt captured output.

## Concurrency, Ordering, and Backpressure

Bound worker pools and queues. Honor provider rate-limit and `Retry-After`
signals. Coordinate retries within one invocation so parallel workers do not
amplify an outage. Prefer a finite exponential backoff with jitter for retryable,
idempotent operations.

Parallel completion order is often nondeterministic. Choose deliberately:

- stable request or sort-key order for replay, diffing, and tests; or
- explicit completion order for lower latency and streaming throughput.

Do not label a command deterministic while emitting timestamps, random IDs,
thread-order results, locale-dependent text, or unstable filesystem/API order
without declaring those fields and semantics.

## Timeouts, Signals, and Unknown Outcomes

Every potentially blocking boundary needs a deadline. Distinguish total,
connect, read/idle, child-process, and graceful-shutdown timeouts when those
differences matter. Defaults must be finite or explicitly justified.

On cancellation:

1. Stop accepting new work.
2. Acknowledge cancellation without corrupting stdout.
3. Propagate it to children and remote operations.
4. Flush a terminal record or durable operation ID when safe.
5. Bound cleanup, escalate when necessary, and reap children.

A caller disappearing does not necessarily cancel a daemon or remote mutation.
Report the resulting operation state. Never turn `timeout` into `not applied`
without proof.

## Caches and Daemons

Caches must have explicit keys and invalidation inputs: tool/schema version,
workspace, configuration, environment that affects semantics, inputs, and remote
revision as applicable. Write cache state atomically, handle concurrent readers
and writers, and expose `--offline`, `--refresh`, or cache inspection when useful.
Do not clear a healthy cache as routine automation.

Use a daemon only after measurement shows repeated initialization dominates.
A daemon requires a versioned local protocol, per-user/workspace isolation,
secure endpoint permissions, bounded queue and memory, health checks, idle
lifetime, upgrade handling, reconnect/restart behavior, and explicit
`status`/`stop`/`clear-cache` operations. Revalidate cwd, config, credentials, and
authorization on each request. Ensure client cancellation reaches daemon work.

One-shot execution is usually safer for rare, privileged, or destructive work.

## Reproducible Benchmark Matrix

Commit a benchmark definition that covers relevant cases:

| Case | State or assertion |
| --- | --- |
| `--help`, `--version`, capabilities | Cold and warm; offline; no project required |
| Invalid command/input and not-found | Fast failure without broad initialization |
| Narrow local read | Empty and representative workspace |
| Representative batch | 1, typical, and safety-limit item counts |
| Cache-dependent command | Cold, warm, refresh, and disabled cache |
| Network command | Controlled fixture for latency, timeout, rate limit, and retry |
| Stream | Time to first record, sustained throughput, bounded memory |
| Cancellation | Each major phase; children reaped; outcome classified |
| Concurrent calls | Deterministic result, lock/cache safety, bounded provider load |

Record executable version/commit, OS, CPU, memory, storage/filesystem, power
mode, direct-exec versus shell, locale, environment, config, dataset checksum,
cache state, output mode, and semantic scope. Verify compared commands do the
same work and emit equivalent results.

Measure:

- wall-clock time and time to first record;
- p50/p95/p99 or retained raw samples;
- user/system CPU and peak resident memory;
- input/output bytes and record count;
- child/network call count, retries, and error rate.

Use a direct-execution benchmark path. Hyperfine recommends `--shell=none` when
shell overhead is material, especially for commands below roughly 5 ms; that is
a measurement warning, not a CLI service-level objective. Warmups are suitable
for warm-cache tests, while cold-state setup must be explicit and reproducible.

Gate regressions against product budgets for both warm and cold modes. Prefer a
budget on p95 and first record plus CPU/RSS/output envelopes over a single median.

## Sources and Precedents

- [Command Line Interface Guidelines: responsiveness](https://clig.dev/#robustness)
- [Hyperfine: intermediate shell and sub-5 ms measurements](https://github.com/sharkdp/hyperfine#intermediate-shell)
- [Hyperfine: warmup and preparation](https://github.com/sharkdp/hyperfine#warmup-runs-and-preparation-commands)
- [bat startup tracing](https://github.com/sharkdp/bat/issues/2545#issuecomment-1512858119)
- [ripgrep performance design and benchmark caveats](https://github.com/BurntSushi/ripgrep#is-it-really-faster-than-everything-else)
- [ripgrep deterministic-order tradeoff](https://github.com/BurntSushi/ripgrep/blob/master/FAQ.md#how-can-i-get-results-in-a-consistent-order)
- [uv cache behavior](https://docs.astral.sh/uv/concepts/cache/)
- [uv benchmark tooling](https://docs.astral.sh/uv/reference/contributing/#benchmarks)
- [Node child-process pipe and buffer behavior](https://nodejs.org/api/child_process.html#child-process)
- [Python subprocess pipe behavior](https://docs.python.org/3/library/subprocess.html#popen-objects)
- [GitHub REST rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [gRPC flow control](https://grpc.io/docs/guides/flow-control/)
