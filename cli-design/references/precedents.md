# Precedents and Evidence

No tool is agent-first throughout. Borrow a specific contract, not its fashion.

| Tool or standard | Pattern worth borrowing | Important limit |
| --- | --- | --- |
| [POSIX utilities](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html) | Conventional argv and exit behavior | Convention is not a rich machine schema |
| [Git status](https://git-scm.com/docs/git-status.html) | Config-independent porcelain and NUL-safe paths | Human status remains unsafe to parse |
| [GitHub CLI](https://cli.github.com/manual/gh_help_formatting) | JSON field discovery/projection and embedded `jq` | Coverage varies by command |
| [Cargo](https://doc.rust-lang.org/cargo/reference/external-tools.html) | Versioned metadata and typed JSONL messages | Child output can escape the stream |
| [kubectl](https://kubernetes.io/docs/reference/kubectl/) | Structured views, declarative convergence, client/server dry run | Ambient cluster context raises risk |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html) and [Google AIPs](https://google.aip.dev/158) | Request files, opaque cursors, paging controls | Auto-fetch and defaults can surprise automation |
| [Docker Buildx](https://docs.docker.com/reference/cli/docker/buildx/build/) | Separate TTY, plain, quiet, and raw-JSON progress | Templates are not a canonical schema |
| [jq](https://jqlang.org/manual/) | Raw, streaming, NUL-safe, and predicate modes | Match mode to data |
| [ripgrep](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md) and [uv](https://docs.astral.sh/uv/reference/contributing/#profiling-and-benchmarking) | Startup and executable-level regression measurement | Their numbers are not transferable budgets |
| [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html) and [GNU findutils](https://www.gnu.org/software/findutils/manual/html_node/find_html/Security-Considerations) | Structured execution and hostile-path testing | Allowlists and containment must match the trust boundary |

Recurring lesson: publish a stable machine surface distinct from human
presentation, but add paging, durable operations, schemas, and heavy safety
machinery only when the domain requires them.
