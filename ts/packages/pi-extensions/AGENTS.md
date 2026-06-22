# pi-extensions

This package contains Pi extension modules. Keep extension code testable through the host API instead of reaching directly into Node process globals.

## Package Boundary

`@sdl/pi-extensions` is a leaf package for project-local Pi adapters. Other workspace packages must not import from it. If a non-leaf package needs shared behavior that currently lives here, move or copy the shared contract into a lower-level package instead of adding a dependency on `@sdl/pi-extensions`.

## Process I/O

Extension modules must not import `node:child_process` or perform synchronous process/spawning I/O. Execute processes through the injected `pi.exec` host capability or a narrow injected function built from it.

Canonical seams:

- `src/changes.ts` passes an `execGit` function into snapshot loading.
- `src/runner-subagent/curated-context.ts` uses `CuratedContextExecGit` for git evidence.
- `src/runner-subagent/subagent-process.ts` is the async-spawn adapter seam for runner subagents; module logic depends on injected process functions.
- `src/claude/interactive-spawn.ts` is the designated interactive Claude Code adapter seam. It may import `node:child_process` and use synchronous `spawnSync` only while the TUI is stopped; the event-loop freeze is intentional because the terminal is handed to the interactive child, matching Pi's upstream interactive-shell pattern. Module logic must depend on the injected `RunInteractiveClaude` type, never on this adapter.
- The exec result contract lives in `@sdl/core/exec`.

Why: direct or synchronous process I/O blocks the extension host event loop and bypasses the fake-driven tests that should exercise extension behavior without invoking real commands. The Claude Code seam is the narrow exception: the TUI is stopped first, so no host rendering should occur until the child exits and the TUI restarts.

## Heuristic parsers

Any extraction or matching heuristic must ship with adversarial fixtures. Include negative tests for prose inputs and false-positive probes, not only happy-path examples.

## Tool schema sync

When a tool's behavior changes, update its parameter descriptions and prompt guidelines in the same PR. Tool schemas are part of the agent-facing contract.

## Extension anatomy

Each extension declares its own `ExtensionAPI` with only the capabilities it uses. If an extension needs process execution, mirror the `exec` member shape used by `src/worktree-status.ts`.

## Immediate command acknowledgement

Every repo-owned Pi slash command must acknowledge receipt synchronously, before awaiting `ctx.waitForIdle()` or starting slow work. Use `withImmediateCommandAck` from `@sdl/pi-extension-runtime/command-ack` at the extension registration boundary instead of hand-writing per-command acknowledgements.

- Default acknowledgement delivery is an above-fold dim transcript message when the host supports rendered custom messages; it falls back to a transient status line for minimal hosts.
- Command `ctx.ui.setStatus(...)` keeps its original status/footer behavior by default. Above-fold transcript progress from status calls must be requested explicitly with `{ progressDelivery: "message" }` or `{ progressDelivery: "both" }`.
- `sendCommandProgressOrNotify({ host, ctx, message, level, shouldNotifyWhenNoUi })` defaults to above-fold dim transcript progress when rendered custom messages are available, but honors the current wrapper's `progressDelivery`: `"status"` uses the notification/status fallback only, `"message"` emits above-fold only, `"both"` emits both, and `"none"` suppresses helper progress.
- Use `{ delivery: "status" }` only when the acknowledgement must stay out of the transcript.
- Use `{ progressDelivery: "status" }` explicitly for ticker-heavy commands whose `setStatus` calls intentionally manage a persistent footer/lifecycle surface rather than command progress.
- Wrap command-registering aggregate adapters once before passing the host to sub-registrars. If a sub-registrar wraps again, its explicit `progressDelivery` takes precedence for the commands it registers; acknowledgement delivery is conservative, so an already message-capable/default wrapper keeps message acknowledgement unless `delivery: "status"` was selected at the first wrapping point. Nested acknowledgement emission is still deduplicated by command/context.
- Vibecoded `.pi/extensions/*.ts` commands should use the same helper via the source import path until promoted into package code.
- Tests for command timing should account for acknowledgement/progress messages before the command's own output.

Use the package/domain vocabulary from `CONTEXT.md`, routed through the repo root `CONTEXT-MAP.md`, before naming new concepts. Do not edit domain-language files unless the task explicitly asks for it.
