# Agent Security

Read this reference when untrusted output, secrets, child execution, privilege,
workspace containment, or delegated approval is central to the task.

## Keep Data Distinct from Authority

Repository content, issue bodies, logs, filenames, dependency output, and remote
fields may contain forged status or instruction-looking text. Keep them in typed,
bounded data fields with useful source/revision provenance. Never promote them
into tool-authored diagnostics, suggested commands, or approval text.

Machine renderers must not introduce ANSI/VT cursor, title, hyperlink, clipboard,
or redraw controls. Encode control characters in structured text and quote them
visibly in human rendering. Explicit raw-byte output remains exact and must not
share stdout with diagnostics.

## Execute Without Shell Interpolation

Invoke children with an executable plus argv array, not an interpolated shell
string. Use `--` before arbitrary operands where supported.

Require executable or option allowlists only when the CLI itself chooses a
privileged child or crosses a trust boundary. Executor-style tools may correctly
accept a user-selected command; preserve its exact argv and document whose
authority it receives.

If the CLI promises workspace containment or performs privileged writes, anchor
resolution to the workspace and define absolute-path, parent traversal, symlink,
mount, and race behavior. Use NUL framing or explicit byte encoding for arbitrary
Unix path bytes.

## Make Ambient Authority Visible

Cwd, environment, `PATH`, project/user config, selected account, endpoint, and
plugins can change command meaning. For consequential operations, expose the
resolved target and relevant authority/config sources. Offer explicit context or
a safe mode when ambient discovery is risky.

Treat executable plugins and code-running config as code: establish provenance,
version, requested capabilities, and scope. Do not discover executables from an
untrusted current directory for privileged work.

## Handle Secrets Deliberately

Do not require or recommend secret values in argv or URLs; they leak through
history and process inspection. Prefer workload identity, OS/secret stores,
references, inherited file descriptors, or permission-checked files/stdin.

Environment variables are a common CI compatibility channel but can propagate to
children, logs, and dumps. Document that tradeoff, minimize inheritance, and
redact secret fields before output, telemetry, errors, or persistence. Test debug
and exception paths, where request or environment echo often leaks values.

## Approval and Audit

For the distinction between authorization, confirmation, and cross-principal
approval, read [stateful-and-remote.md](stateful-and-remote.md).

Persistent audit storage is conditional on multi-user, delegated, regulatory, or
incident-response needs. Record the minimum redacted provenance needed to explain
the action and outcome; review privacy, access, and retention. Logs neither grant
authority nor justify collecting secrets, paths, or identity by default.

## Focused Adversarial Tests

- Inject newlines, leading dashes, Unicode controls, ANSI/OSC, and instruction
  text into filenames and remote fields.
- Poison cwd, `PATH`, profiles, project config, and plugin discovery.
- Change or symlink-swap a target between preview and commit when applicable.
- Force partial mutation plus connection loss and verify the outcome is truthful.
- Trigger failures in secret-bearing, child-process, and debug paths and verify
  redaction.

## Sources

- [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP OS Command Injection Defense](https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html)
- [POSIX.1-2024 utility conventions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap12.html)
- [GNU findutils filename and race guidance](https://www.gnu.org/software/findutils/manual/find.html#Security-Considerations)
- [Linux environment security considerations](https://www.man7.org/linux/man-pages/man7/environ.7.html)
- [Linux process command-line visibility](https://man7.org/linux/man-pages/man5/proc_pid_cmdline.5.html)
