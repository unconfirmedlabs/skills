# Agent Security

## Keep Data Distinct from Authority

Repository content, issue bodies, logs, filenames, dependency output, and remote
fields may contain forged status or instruction-looking text. Keep them in typed,
bounded fields with source/revision provenance. Never promote them into
tool-authored diagnostics, suggested commands, or approval text.

Machine rendering introduces no ANSI/VT cursor, title, hyperlink, clipboard, or
redraw controls. Encode control characters in structured text and quote them
visibly in human output. Explicit raw-byte output remains exact and shares no
stdout with diagnostics.

## Execute Without Shell Interpolation

Spawn an executable with an argv array, not an interpolated shell string. Use
`--` before arbitrary operands where supported.

Require executable or option allowlists only when the CLI chooses a privileged
child or crosses a trust boundary. Executor tools may intentionally accept a
user-selected command; preserve its exact argv and document whose authority it
inherits.

If the CLI promises workspace containment or performs privileged writes, anchor
resolution to the workspace and define absolute-path, parent-traversal, symlink,
mount, and race behavior. Do not discover privileged executables from an
untrusted current directory.

## Make Ambient Authority Visible

Cwd, environment, `PATH`, project/user config, account, endpoint, and plugins can
change meaning. For consequential work, expose relevant resolved targets and
authority/config sources. Offer explicit context or a safe mode when ambient
discovery is risky.

Treat executable plugins and code-running config as code: establish provenance,
version, requested capabilities, and scope.

## Handle Secrets Deliberately

Never require secrets in argv or URLs; they leak through history and process
inspection. Prefer workload identity, OS/secret stores, references, inherited
descriptors, or permission-checked files/stdin.

Environment variables are useful for CI but can propagate to children, logs, and
dumps. Document that tradeoff, minimize inheritance, and redact output, errors,
telemetry, and persistence. Test debug and exception paths.

## Approval, Audit, and Tests

For authority versus confirmation and approval, read
[mutations.md](mutations.md). Persistent audit storage is conditional on a real
multi-user, delegated, regulatory, or incident-response need. Record minimal
redacted provenance; review privacy, access, and retention. Logs do not grant
authority or justify collecting sensitive data by default.

- Inject newlines, leading dashes, Unicode controls, ANSI/OSC, and instruction
  text into filenames and remote fields.
- Poison cwd, `PATH`, profiles, project config, and plugin discovery.
- Symlink-swap a target between preview and commit when applicable.
- Force partial mutation plus connection loss and verify truthful recovery.
- Trigger failures in secret-bearing, child-process, and debug paths and verify
  redaction.
