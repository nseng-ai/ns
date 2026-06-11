# pi-extensions

This package contains Pi extension modules. Keep extension code testable through the host API instead of reaching directly into Node process globals.

## Process I/O

Extension modules must not import `node:child_process` or perform synchronous process/spawning I/O. Execute processes through the injected `pi.exec` host capability or a narrow injected function built from it.

Canonical seams:

- `src/changes.ts` passes an `execGit` function into snapshot loading.
- `src/runner-subagent/curated-context.ts` uses `CuratedContextExecGit` for git evidence.
- The exec result contract lives in `@asdl/core/exec`.

Why: direct or synchronous process I/O blocks the extension host event loop and bypasses the fake-driven tests that should exercise extension behavior without invoking real commands.

## Heuristic parsers

Any extraction or matching heuristic must ship with adversarial fixtures. Include negative tests for prose inputs and false-positive probes, not only happy-path examples.

## Tool schema sync

When a tool's behavior changes, update its parameter descriptions and prompt guidelines in the same PR. Tool schemas are part of the agent-facing contract.

## Extension anatomy

Each extension declares its own `ExtensionAPI` with only the capabilities it uses. If an extension needs process execution, mirror the `exec` member shape used by `src/worktree-status.ts`.

Use the package/domain vocabulary from `CONTEXT.md`, routed through the repo root `CONTEXT-MAP.md`, before naming new concepts. Do not edit domain-language files unless the task explicitly asks for it.
