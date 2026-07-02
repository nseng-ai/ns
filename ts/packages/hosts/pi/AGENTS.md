# @sdl/pi

This package contains unified Pi runtime helper and extension modules. Keep extension code testable through the host API instead of reaching directly into Node process globals.

## Package Boundary

`@sdl/pi` is a private package with two kinds of modules:

- neutral helper subpaths exported as `@sdl/pi/...` for other workspace packages such as CCC, Objective, branch-context, autobranch, and sdlcc;
- project-local Pi extension entrypoints imported by `.pi/extensions/*.ts` discovery adapters.

Other workspace packages may import curated neutral `@sdl/pi/...` exports. They must not import project-local extension entrypoints or deep-import `ts/packages/pi/src/**` as helpers. If a non-Pi package needs behavior that currently lives only in a project-local entrypoint, extract a neutral helper subpath or move the orchestration to the owning package instead.

`@sdl/pi/shared/*` exports are curated neutral infrastructure helpers for Pi-hosted code and extracted Local Pi-tool packages. A Local Pi-tool package may import helpers such as `@sdl/pi/shared/exec-gateway` or `@sdl/pi/shared/gh-command` when the helper is host/runtime infrastructure. Do not invert the dependency by making `@sdl/pi` import Local Pi-tool packages, and do not move tool-specific PR feedback/watch/preview domain behavior into `@sdl/pi/shared/*` just to deduplicate it.

## Process I/O

Extension modules must not import `node:child_process` or perform synchronous process/spawning I/O. Execute processes through the injected `pi.exec` host capability or a narrow injected function built from it.

Canonical seams:

- `ts/packages/local/pi-tools/src/runner-subagents/curated-context.ts` uses `CuratedContextExecGit` for git evidence.
- `ts/packages/local/pi-tools/src/runner-subagents/subagent-process.ts` is the async-spawn adapter seam for runner subagents; module logic depends on injected process functions.
- `src/claude/interactive-spawn.ts` is the designated interactive Claude Code adapter seam. It may import `node:child_process` and use synchronous `spawnSync` only while the TUI is stopped; the event-loop freeze is intentional because the terminal is handed to the interactive child, matching Pi's upstream interactive-shell pattern. Module logic must depend on the injected `RunInteractiveClaude` type, never on this adapter.
- The injected host `ctx.exec` author-facing result shape lives in `@sdl/kernel/sdk`. The command-execution gateway lives in `@sdl/core/exec`: pure command types/helpers are re-exported from `@sdl/core/command`, and the real Node child-process adapter (`runCommand`, `NodeCommandExecApi`) lives in `@sdl/core/exec` itself.

Why: direct or synchronous process I/O blocks the extension host event loop and bypasses the fake-driven tests that should exercise extension behavior without invoking real commands. The Claude Code seam is the narrow exception: the TUI is stopped first, so no host rendering should occur until the child exits and the TUI restarts.

## Heuristic parsers

Any extraction or matching heuristic must ship with adversarial fixtures. Include negative tests for prose inputs and false-positive probes, not only happy-path examples.

## Tool schema sync

When a tool's behavior changes, update its parameter descriptions and prompt guidelines in the same PR. Tool schemas are part of the agent-facing contract.

## Extension anatomy

Each extension declares its own `ExtensionAPI` with only the capabilities it uses. If an extension needs process execution, mirror the `exec` member shape used by `src/worktree-status/extension.ts`.

## Immediate command acknowledgement

Every repo-owned Pi slash command must acknowledge receipt synchronously, before awaiting `ctx.waitForIdle()` or starting slow work. Use `registerCommandWithImmediateAck` from `@sdl/pi/commands/ack` at each command registration site instead of hand-writing per-command acknowledgements or wrapping the host.

- Default acknowledgement delivery is an above-fold dim transcript message when the host supports rendered custom messages; it falls back to a transient status line for minimal hosts.
- Command `ctx.ui.setStatus(...)` keeps its original status/footer behavior and must not implicitly emit transcript progress.
- Use `sendCommandProgressOrNotify({ host, ctx, message, delivery, level, shouldNotifyWhenNoUi })` only for explicit transcript-progress milestones. `delivery` may be `"message"`, `"notify"`, `"both"`, or `"none"`.
- Use `{ delivery: "status" }` on `registerCommandWithImmediateAck` only when the acknowledgement must stay out of the transcript.
- Aggregate adapters should pass the real host to sub-registrars. Each sub-registrar that registers commands should call `registerCommandWithImmediateAck` itself; there is no wrapped host that makes later `registerCommand` calls safe automatically.
- Vibecoded `.pi/extensions/*.ts` commands should use the same helper via the source import path until promoted into package code.
- Tests for command timing should account for acknowledgement/progress messages before the command's own output.

For the full agent checklist, see repo-root `docs/pi/extension-command-checklist.md`.

Use the package/domain vocabulary from `CONTEXT.md`, routed through the repo root `CONTEXT-MAP.md`, before naming new concepts. Do not edit domain-language files unless the task explicitly asks for it.
