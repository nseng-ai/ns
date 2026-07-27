# Pi Extension Command Checklist

This checklist is for agents adding, changing, or reviewing repo-owned Pi slash commands in this repository.
It combines the Pi runtime extension API with this repo's command-registration policy.

## Ground rules

- Pi extension commands are registered with `pi.registerCommand(name, { description, handler, ... })`; `name` is the command without the leading `/`.
- Project-local discovery adapters live under `.pi/extensions/`; durable tested implementation belongs in its owning engineered destination: `@nseng-ai/pi-runtime`, a separate `pi-ns-<domain>` host-adapter package, an extension `pi` subpackage where extraction has not yet occurred, or an Internal Pi-tool package under `ts/packages/internal/hosts/pi/tools/pi-tools/`.
- Command handlers receive Pi's `ExtensionCommandContext`. Use command-only methods such as `ctx.waitForIdle()` only inside command handlers.
- `ctx.ui.setStatus(...)` is footer/status UI. It is not transcript progress.
- Above-fold transcript progress is explicit: use `sendCommandProgressOrNotify(...)` or `sendCommandProgressMessage(...)` at selected milestones.
- `pi.getCommands()` / RPC `get_commands` `sourceInfo` is the canonical command provenance. Do not infer ownership from a command name alone.

## Registration pattern

Every repo-owned Pi slash command should acknowledge receipt synchronously before it waits for idle state or starts slow I/O.
Use `registerCommandWithImmediateAck` from `@nseng-ai/pi-runtime/commands/ack` at each registration site:

```ts
import { registerCommandWithImmediateAck } from "@nseng-ai/pi-runtime/commands/ack";

export function registerExampleCommand(pi: ExampleExtensionAPI): void {
	registerCommandWithImmediateAck({
		host: pi,
		commandName: "example:run",
		commandDefinition: {
			description: "Run the example workflow.",
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				await runExample({ pi, args, ctx });
			},
		},
		options: { delivery: "message" },
	});
}
```

Do not recreate the old wrapped-host pattern:

```ts
// Do not add this pattern.
const commandPi = withImmediateCommandAck(pi);
commandPi.registerCommand("example:run", { ... });
```

Aggregate adapters should pass the real host to sub-registrars. Each sub-registrar that registers commands should call `registerCommandWithImmediateAck` itself. There is no proxy wrapper that makes later `registerCommand` calls safe automatically.

## Progress pattern

Use status for ephemeral lifecycle state and explicit progress helpers for transcript-visible milestones:

```ts
ctx.ui.setStatus("example:run", "preparing…");
sendCommandProgressOrNotify({ host: pi, ctx, message: "Running example command…" });
```

`sendCommandProgressOrNotify` defaults to rendered `ns-command-progress` messages when the host supports rendered custom messages. If rendered messages are unavailable, it falls back to `ctx.ui.notify(..., "info")`. Optional `delivery` values are:

- `"message"` — transcript/custom-message progress when possible; notify fallback otherwise. This is the default.
- `"notify"` — notification only.
- `"both"` — rendered progress when possible plus notification.
- `"none"` — suppress helper output.

Guard no-UI flows deliberately. Use `shouldNotifyWhenNoUi: true` only when the non-UI caller still needs a notification fallback.

### Cross CLI/Pi progress

If the same workflow is reachable from both an ns CLI command and a Pi slash-command mirror, do not solve progress only with Pi helpers or `ctx.ui.setStatus(...)`. Put the progress seam in the lower orchestration layer with SDK `NsCommandIo`:

- use `io.phase(...)` for human-facing intermediate progress;
- use durable command presentation or `io.notify(...)` for final summaries and diagnostics;
- in CLI adapters, route phases to `ctx.onOutput?.("stderr", text)` when available, otherwise to `stderr`;
- in Pi rendered flows, avoid duplicating a custom `pi.sendMessage(...)` stream through `NsCommandIo`; use `NsCommandIo` as the fallback when no rendered/live message path exists.

For Herdr extension workflows, read `ts/packages/incubating/extensions/herdr/AGENTS.md` before changing progress behavior. `sendCommandProgressOrNotify(...)` remains the right primitive for Pi-only adapter milestones; `NsCommandIo` is the portable seam for shared CLI/Pi execution.

## Checklist for adding or changing a command

Before editing:

- [ ] Identify the owning layer: `.pi/extensions/` discovery adapter, `@nseng-ai/pi-runtime` host behavior, a `pi-ns-<domain>` host adapter, a remaining extension `pi` subpackage, or an Internal Pi-tool package.
- [ ] Read the relevant package `AGENTS.md` and `CONTEXT.md` before naming new concepts.
- [ ] Pick a command namespace by workflow ownership, not file location. First-party product/orchestration commands default to `/ns:<extension>:...`; keep `/pi:*` for Pi-native UI/session affordances.
- [ ] Check for existing command names with `rg` or Pi RPC inventory; avoid duplicate public slash commands unless intentionally documented.

While editing:

- [ ] Register every repo-owned command with `registerCommandWithImmediateAck(...)` at the exact `registerCommand` call site and choose explicit acknowledgement delivery. Use `options: { delivery: "message" }` normally; use `status` only with a stated reason that transcript output is inappropriate.
- [ ] Do not add `withImmediateCommandAck`, `Proxy`, wrapped command hosts, hidden command-context state, or `ctx.ui.setStatus` interception.
- [ ] Preserve command-definition fields such as `description`, `argumentHint`, and `getArgumentCompletions`.
- [ ] Keep host interfaces narrow: declare only the Pi capabilities the module uses.
- [ ] Use injected `pi.exec` or narrow injected functions for process work; do not import `node:child_process` in ordinary extension modules.
- [ ] Use `ctx.waitForIdle()` only after immediate acknowledgement is already registered by the helper.
- [ ] Keep `ctx.ui.setStatus` as footer/status state; add `sendCommandProgressOrNotify` only for user-visible milestones that belong in the transcript.
- [ ] If the command registers custom-message output, register renderers on the real host and pass the real host to execution helpers.
- [ ] Update parity metadata when adding or renaming a package-owned Pi command.
- [ ] If a model-visible tool's behavior changes, update its schema descriptions and prompt guidance in the same change.

Tests and review:

- [ ] Add or update package tests for durable/risky command behavior. Use fakes instead of real `git`, `gt`, `gh`, shell, or network calls.
- [ ] Assert immediate acknowledgement ordering before idle waits or command I/O. For the normal `delivery: "message"` policy, a rendered host receives an `ns-command-ack` custom message; test any deliberate `status` exception separately.
- [ ] Assert that ordinary `ctx.ui.setStatus` calls remain status calls and do not create `ns-command-progress` messages.
- [ ] Assert explicit progress helper behavior when transcript progress is part of the user-visible contract.
- [ ] Keep tests that filter `ns-command-ack` / `ns-command-progress` deliberate; do not delete meaningful assertions just to quiet output drift.
- [ ] Run focused tests first, then repo TypeScript gates when TypeScript changed: `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`; include `just ts-test-integration` for integration-lane coverage and `just ts-test-typescript-style-guard` for architectural guard coverage.

Final stale-pattern check:

```bash
rg -n "withImmediateCommandAck|progressDelivery|wrapCommandContextForProgress|COMMAND_ACK_HOST|COMMAND_PROGRESS_CONTEXT|new Proxy" ts/packages .pi/extensions --glob '*.ts'
```

Expected result: no matches for command-ack wrapper/proxy/status-interception machinery. Matches for unrelated constants named `COMMAND_*` are not relevant unless they are command-ack hidden symbols.
