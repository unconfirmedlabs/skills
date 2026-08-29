# CLI Exemplars and Tradeoffs

This is a pattern library, not a popularity ranking or a claim that any tool is
agent-first throughout. Borrow the maintained automation contracts and notice
where a human-oriented default creates agent friction. Sources were reviewed on
2026-08-29.

## Git: Separate Stable Plumbing from Human Porcelain

Git explicitly distinguishes lower-level plumbing from user-facing porcelain.
The strongest agent pattern is `git status --porcelain`: version 1 promises
backward-compatible output, ignores color and user-relative path configuration,
and supports `-z` for unambiguous filenames.

Borrow:

- Name the supported automation surface and give it stronger stability than
  human presentation.
- Make it independent of locale, color, and user formatting config.
- Provide NUL framing for path-bearing text protocols.

Avoid parsing ordinary `git status` or similarly formatted human output.

Sources: [Git command categories](https://git-scm.com/docs/git),
[git-status porcelain formats](https://git-scm.com/docs/git-status.html)

## GitHub CLI: Field Selection and Embedded Queries

Many `gh` commands expose `--json <fields>` plus `--jq` and `--template`.
Omitting the field list discovers available JSON fields. This lets a caller
request only the data it needs and transform it without parsing a table.

Borrow field discovery and projection. Treat templates as presentation, not the
canonical schema. Keep JSON support consistent across commands; partial coverage
forces agents back to prose parsing.

Sources: [gh formatting](https://cli.github.com/manual/gh_help_formatting),
[gh api pagination](https://cli.github.com/manual/gh_api),
[gh automation environment](https://cli.github.com/manual/gh_help_environment)

## Cargo: Versioned Metadata and Typed JSONL Events

Cargo supports stable, versioned `cargo metadata --format-version` output and
newline-delimited JSON build messages with a `reason` discriminator. The event
stream carries compiler diagnostics, artifacts, and build-script results.

Borrow explicit format negotiation and typed progressive events. Note Cargo's
documented limitation: subprocess or procedural-macro output can still escape
the structured protocol. An agent-grade wrapper should capture, label, or
separate child output rather than leave callers to guess which lines are JSON.

Source: [Cargo external tools](https://doc.rust-lang.org/cargo/reference/external-tools.html)

## Kubernetes CLI: Declarative Apply and Preview Fidelity

`kubectl` offers JSON/YAML/JSONPath/custom-column output, declarative `apply`,
client- and server-side dry run, watch events, sorting, and field-manager
ownership. The server-side preview distinction matters: local syntax validation
does not prove authorization, admission, defaulting, or conflict behavior.

Borrow:

- declarative convergence when resources have durable desired state;
- explicit preview fidelity;
- machine snapshots and typed watch events;
- ownership/revision concepts for multiple actors.

Sources: [kubectl overview and output options](https://kubernetes.io/docs/reference/kubectl/),
[kubectl apply](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/),
[kubectl get](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/)

## AWS CLI: Generated Requests and Explicit Pagination Controls

AWS CLI input skeletons and `--cli-input-json`/YAML turn a large request into an
editable artifact instead of a quoting exercise. Pagination exposes page size,
maximum items, continuation tokens, and pager controls. Current versions also
expose auto-prompt and machine error-format controls.

Borrow generated schemas/request files and explicit cursors. Be cautious with
the default auto-fetch-all behavior and client pager: an agent can trigger many
remote requests, huge output, or a blocked pager without intending to. Prefer a
bounded first page plus explicit `--all` in greenfield tools.

Sources: [AWS CLI input skeletons](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-skeleton.html),
[AWS CLI pagination and pager](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html),
[AWS CLI global options](https://docs.aws.amazon.com/cli/latest/reference/)

## Docker: Inspectable State and Machine Progress

`docker inspect` returns low-level JSON and permits field formatting. Docker
BuildKit progress supports TTY, plain, quiet, and `rawjson` modes; `rawjson`
emits JSON lines. These separate state inspection from human display and make a
long operation observable without screen scraping.

Borrow canonical inspect output and explicit progress modes. Do not treat Go
templates as a stable data schema, and do not default agent calls to attached TTY
or interactive execution.

Sources: [docker inspect](https://docs.docker.com/reference/cli/docker/inspect/),
[Docker Buildx progress modes](https://docs.docker.com/reference/cli/docker/buildx/build/)

## jq: Small, Composable Data Boundaries

`jq` provides compact JSON, raw scalar output, streaming parsing, explicit exit
status behavior, and NUL termination for raw values. It demonstrates that a
machine-first tool can remain concise and pleasant for humans.

Borrow distinct structured, raw, compact, streaming, and NUL-safe modes rather
than one overloaded text format.

Source: [jq manual](https://jqlang.org/manual/)

## ripgrep: Speed, Safe Records, and an Explicit Determinism Tradeoff

ripgrep combines fast recursive search with `--json` messages. Its documentation
also exposes a real tradeoff: sorting by path makes output deterministic but
disables parallel search. The project warns that a single benchmark is not
enough and documents semantic/performance cliffs such as alternative regex
engines and high match counts.

Borrow first-class structured matches and make stable-order versus
completion-order behavior explicit. Do not present unmatched benchmark commands
as evidence; confirm identical inputs, filtering, encoding, and output.

Sources: [ripgrep guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md),
[ripgrep performance notes](https://github.com/BurntSushi/ripgrep#is-it-really-faster-than-everything-else),
[ripgrep ordering tradeoff](https://github.com/BurntSushi/ripgrep/blob/master/FAQ.md#how-can-i-get-results-in-a-consistent-order)

## uv: Performance as a Product and a Supported Metadata Surface

uv maintains cold-resolution benchmarks and profiling workflows, documents its
cache semantics, and exposes JSON metadata rather than asking integrations to
parse internal lock or cache files. It also offers controls such as offline,
refresh, and no-progress modes.

Borrow continuous workload benchmarks and a supported inspection interface.
Do not make private persistence formats the de facto API.

Sources: [uv benchmarks](https://docs.astral.sh/uv/reference/benchmarks/),
[uv cache](https://docs.astral.sh/uv/concepts/cache/),
[uv workspace metadata](https://docs.astral.sh/uv/reference/internals/metadata/)

## Cross-Tool Conclusions

The strongest recurring patterns are:

1. A named, stable machine protocol distinct from human presentation.
2. Structured records with field selection, versioning, and documented order.
3. Bounded reads and explicit exhaustive modes.
4. Declarative, previewable, idempotent writes with conflict detection.
5. Streaming events and operation IDs instead of terminal redraws.
6. Offline discovery, explicit context, and a clean non-interactive mode.
7. Performance regression work that includes startup and representative cold
   state, not only steady-state throughput.

The recurring failures are human text treated as an API, inconsistent JSON
coverage, implicit pagination, ambient targets, mandatory prompts or pagers,
unversioned schemas, swallowed partial failure, and slow eager initialization.
