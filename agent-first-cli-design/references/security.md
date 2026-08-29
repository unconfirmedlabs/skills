# Security and Adversarial Inputs

An autonomous agent may treat CLI output as both evidence and a candidate next
instruction. Assume every boundary is attacker-influenced unless its provenance
and integrity are established.

## Untrusted Output and Prompt Injection

Repository files, issue bodies, logs, branch names, dependency output, plugin
responses, and remote API values can contain instruction-looking text or forged
status. Keep untrusted domain data structurally separate from tool-authored
status, hints, and policy decisions.

- Return typed, bounded objects with provenance such as source, resource ID,
  revision, and trust class where useful.
- Never promote remote text into a trusted `message`, `hint`, shell command, or
  approval request.
- Quote or encode arbitrary control characters in human rendering; preserve the
  exact value in a machine-safe field or retrievable artifact.
- Validate any follow-up action against the original caller intent and current
  authorization, not instructions found in prior output.
- Cap output and field sizes. Mark truncation and provide a digest plus a bounded
  retrieval mechanism.

Machine mode must emit no ANSI/VT escapes, cursor motion, terminal-title changes,
OSC hyperlinks, clipboard controls, shell-integration markers, or progress
redraws. Rendered terminal state is not an authoritative record.

## Executables, Arguments, Filenames, and Paths

Invoke an executable directly with an argv array. Never interpolate untrusted
values into `sh -c`, `eval`, a command string, or generated shell source. Fix or
allowlist the executable and option set, validate operands by type and length,
and use `--` before arbitrary operands.

Newline-delimited filenames are unsafe. Use JSON arrays or NUL-delimited
interfaces and test names containing spaces, tabs, newlines, leading dashes,
Unicode direction/zero-width characters, and terminal escape bytes.

For operations inside a workspace:

- Anchor resolution to an already validated workspace directory.
- Reject unexpected absolute paths and parent escape.
- Define symlink, mount, and case-collision policy.
- Avoid check-then-act on path strings in a concurrently writable tree. Prefer
  descriptor-relative/no-follow operations and revalidate at commit time.
- Put limits on recursion depth, files, bytes, wall time, subprocesses, and
  output.

## Ambient Authority and Supply Chain

Current directory, environment, `PATH`, home/project config, selected cloud
profile, region, endpoint, and plugins can silently change the same command's
meaning. Mutations should expose their effective execution envelope:

- absolute workspace root and revision;
- account/principal, project/subscription, region, and endpoint;
- config sources and relevant precedence;
- executable and plugin version/digest;
- resolved target IDs, permissions, and dry-run/commit state.

Offer explicit flags or a safe mode to disable ambient config and plugins when
the domain warrants it. Do not discover executable plugins in the current
directory. Run privileged children with an allowlisted environment and trusted
executable paths.

Treat plugins and config that can invoke code as code. Pin identity and version,
verify digest/signature when supported, declare requested capabilities, isolate
workspace/account scope, and require renewed consent when definitions or
permissions change.

## Secrets

Do not accept secrets in argv, URLs, generated commands, normal output, or debug
messages. Environment variables are also a poor default secret channel because
they can reach child processes, logs, dumps, and system inspection surfaces.

Prefer OS/workload identity, secret-manager references, inherited file
descriptors, or permission-checked files/stdin dedicated to that one purpose.
Mark secret-bearing fields in schemas and redact before logging, telemetry,
errors, persistence, and agent context. Audit the secret reference, version, and
purpose, never its value.

Test exceptions and verbose/debug modes: many leaks occur when a library echoes
the request, URL, environment, or child argv during failure.

## Destructive Approval

A prompt or `--yes` in the same command stream proves convenience, not authority.
For high-impact operations, separate plan from approval and bind approval to a
canonical action manifest containing:

- exact target IDs and count;
- normalized before/after intent and expected revision;
- account/project/region and privilege level;
- irreversible or external effects;
- expiry and single-use nonce.

Require new approval when any material field changes. Keep authorization out of
untrusted tool output and fail closed when the approval cannot be verified.

## Multiple Agents, TOCTOU, and Partial State

A plan becomes stale when another process changes files, configuration, branch,
account state, or remote revision. Include expected revisions/digests and reject
stale commits. Use locks or leases only where optimistic concurrency is
insufficient; make their scope, owner, expiry, and recovery visible.

Mutating batches must enumerate `succeeded`, `failed`, `skipped`, and `unknown`
items. Record whether rollback was attempted and succeeded. Never imply atomicity
or rollback that the backend does not provide.

For archives and generated trees, inspect metadata before extraction and use an
empty, quota-limited temporary directory. Bound file count, total expanded bytes,
individual size, depth, path length, CPU, and time. Reject traversal, absolute
paths, device files, and unexpected links/types. On failure, report and isolate
partial output rather than continuing in the destination.

## Audit Record

For consequential work, record an invocation/run ID and enough redacted
provenance to reconstruct what happened:

- user, agent, executable, and plugin identity/version/digest;
- canonical argv with secret references redacted;
- cwd/workspace, normalized targets, account/project/region/endpoint;
- effective config source hashes and relevant environment allowlist;
- approval ID, input/output artifact digests, timing, retries, exit/signal;
- per-item state, rollback/reconciliation state, and parent operation/delegation
  IDs.

Prefer append-only audit storage with bounded retention appropriate to the
domain. Logging does not authorize an action and must not become a secret store.

## Red-Team Acceptance Cases

1. Filenames and remote fields contain newline, leading `--`, bidi/zero-width
   characters, ANSI CSI/OSC, and an instruction to exfiltrate a secret.
2. `PATH`, cwd, cloud profile/region, project config, and plugin search paths are
   poisoned before invocation.
3. A target is replaced by a symlink or changed by another agent between plan
   and commit.
4. A batch applies only some mutations, then loses the connection.
5. An archive has traversal, links, duplicate/case-colliding names, extreme file
   count, nesting, and expansion ratio.
6. A secret-bearing request fails in argument parsing, network logging, a child
   process, and debug mode.
7. A destructive approval is replayed after its target revision or account has
   changed.

The tests pass only when the CLI remains bounded, does not mis-render or execute
the input, reports exact outcomes, and preserves the original authority scope.

## Sources

- [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP MCP Security](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP OS Command Injection Defense](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)
- [POSIX.1-2024 `--` option delimiter](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
- [GNU findutils: unsafe newline-separated filenames](https://www.gnu.org/software/findutils/manual/find.html#Security-Considerations-for-xargs)
- [GNU findutils: race conditions with `-exec`](https://www.gnu.org/software/findutils/manual/find.html#Race-Conditions-with-_002dexec)
- [Linux `openat2(2)` constrained resolution](https://man7.org/linux/man-pages/man2/openat2.2.html)
- [Linux environment security considerations](https://www.man7.org/linux/man-pages/man7/environ.7.html)
- [Linux process command-line visibility](https://man7.org/linux/man-pages/man5/proc_pid_cmdline.5.html)
- [Python tarfile extraction security](https://docs.python.org/3/library/tarfile.html)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [SLSA provenance model](https://slsa.dev/spec/v1.0/provenance)
