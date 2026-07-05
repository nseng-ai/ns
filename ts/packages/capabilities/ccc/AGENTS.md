# @ns/ccc Agent Notes

## Cross CLI/Pi Progress Output

CCC owns orchestration that is often invoked from both ji CLI commands and Pi slash-command mirrors. When adding or fixing human-facing progress for those workflows, prefer the SDK `NsCommandIo` service and kernel command-I/O adapter instead of inventing a command-local progress sink or relying only on Pi status.

Use this pattern when a workflow can run through `ns ...` and `/ns:...` or another Pi mirror:

- Thread an `NsCommandIo` (usually named `progressIo` or `io`) through lower orchestration code that owns the long-running phases.
- Emit intermediate, non-contractual progress with `io.phase(...)`.
- Emit durable final notifications with `io.notify(...)` or the command's existing final presentation path.
- In CLI adapters, route phase output to `ctx.onOutput?.("stderr", text)` when available, otherwise to `stderr`; keep primary final output on `stdout` where existing command contracts expect it.
- In Pi-rendered flows that already use `pi.sendMessage(...)` custom messages, do not duplicate the same progress through `NsCommandIo`; use `NsCommandIo` as the fallback when no renderer/live message path exists.
- Treat `ctx.ui.setStatus(...)` as transient status/footer state only. It is not sufficient for user-visible progress in CLI or bridge contexts.

Reference examples:

- `src/autoslot.ts` for a compact CLI `NsCommandIo` adapter.
- `src/land.ts`, `src/land-stack.ts`, and `src/land-stack/command-stream.ts` for a Pi-rendered command stream with CLI/`onOutput` fallback.

See also `docs/pi/extension-command-checklist.md` for Pi-only progress helpers and the boundary between `NsCommandIo`, status, and transcript messages.
