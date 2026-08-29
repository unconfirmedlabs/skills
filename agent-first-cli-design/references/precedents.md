# Precedents

Read this only when examples or evidence would clarify a disputed tradeoff. No
tool is agent-first throughout; borrow the specific contract, not its fashion.

| Tool | Pattern worth borrowing | Caveat |
| --- | --- | --- |
| [Git status](https://git-scm.com/docs/git-status.html) | Named stable porcelain format, config-independent output, NUL-safe paths | Ordinary human status remains unsafe to parse |
| [GitHub CLI](https://cli.github.com/manual/gh_help_formatting) | JSON field discovery/projection and embedded `jq` | JSON coverage is not uniform across every command |
| [Cargo](https://doc.rust-lang.org/cargo/reference/external-tools.html) | Versioned metadata and typed JSONL build messages | Child/tool output can escape the structured stream |
| [kubectl](https://kubernetes.io/docs/reference/kubectl/) | Structured views, declarative apply, client/server dry-run distinction | Ambient cluster context and a very broad surface raise risk |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html) | Request files, cursors, page controls, machine error formats | Auto-fetch-all and pagers can surprise automation |
| [Docker Buildx](https://docs.docker.com/reference/cli/docker/buildx/build/) | Separate TTY, plain, quiet, and raw-JSON progress modes | Templates are presentation, not a canonical schema |
| [jq](https://jqlang.org/manual/) | Compact/raw/streaming/NUL-safe modes and meaningful exit behavior | Match the mode to the data rather than defaulting everything to JSON |
| [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md) | Fast structured search and explicit ordering/performance tradeoffs | A stable sort can disable parallelism |
| [uv metadata](https://docs.astral.sh/uv/reference/internals/metadata/) | Preview of exposing metadata instead of parsing private files | It is explicitly preview; schema stability is not final |

Recurring lesson: publish a stable machine surface distinct from human
presentation, but add pagination, durable operations, schemas, and heavy safety
machinery only when the underlying domain requires them.
