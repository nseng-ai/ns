# ns-pi-subagents

Pi has no built-in subagent system. `@nseng-ai/ns-pi-subagents` adds one.

A **subagent** here is a real child Pi process (`pi --mode json -p --no-extensions --session <file> <prompt>`) that the parent agent launches for one focused task. The parent supplies all context in the prompt; the child runs hermetically with no extensions (so it cannot recurse), an optional tool allowlist, and its own session JSONL file that remains the durable transcript of what it did.

The package works at two levels:

1. **Register the extension** and your Pi session gains ready-made subagent tools — `explore` and `dispatch_runner_subagent` — plus a shared fleet widget and navigator for watching subagent runs.
2. **Import the `/api` library** and build your own subagent tools: define what the child does, how it reports back (structured terminal tool or final text), which tools and model it gets, and how its progress shows up in the UI.

The workspace/npm package name is `@nseng-ai/ns-pi-subagents`.

## Installing the extension

The package manifest declares:

```json
{
  "pi": { "extensions": ["./src/extension.ts"] }
}
```

The package is a private workspace package; Pi package setups can register `@nseng-ai/ns-pi-subagents` inside this workspace. For local workspace dogfood, `.pi/extensions/agents.ts` imports `@nseng-ai/ns-pi-subagents/extension` through the repo workspace resolver.

Registering the extension gives the session:

### `explore` — parallel read-only scouts

The parent agent provides one or more focused read-only scouting tasks; the extension launches a child Pi session per task, in parallel. Results come back as bounded direct findings plus session-file paths for the raw transcripts.

- Explorer children are read-only by allowlist: `read`, `grep`, `find`, and `ls` only — no `bash`, `edit`, or `write`.
- Direct result text is capped per task and in total; raw transcripts remain available through the reported session files.
- Cheap-model policy: Anthropic-first/Haiku where available, falling back to the parent model otherwise (including transient-failure failover).
- Each breadth profile carries its own wall-clock budget.

### `dispatch_runner_subagent` — one focused runner

Launches a single forked Pi process running the `runner` agent (defined in `.ns/pi/agents/runner.md`) with a composed prompt plus a curated context packet (git status/diff and referenced-file excerpts). Returns final-text evidence and status. If the runner agent definition is missing or invalid, the tool registers in a misconfigured state that explains what to fix.

### Fleet widget and navigator

The extension maintains session-local recent/current subagent fleet state for the Pi process and renders a persistent `ns.agents.fleet` widget — running tasks first, recent completed tasks after (capped at 20). The widget is intentionally not a durable index: it resets when Pi restarts and writes no XDG or repo-local state.

The `/ns:agents:fleet` command (also F2 / alt+e / shift+ctrl+e) opens the fleet navigator over known child sessions. In hosts without an interactive UI it emits a compact transcript/session summary instead. Child Pi JSONL files remain the source of truth; the navigator never mutates transcripts or creates a secondary store.

All subagent tools that share one `pi` object share one fleet registry, so built-in and custom subagents appear in the same widget.

## Building your own subagent tool

Import from `@nseng-ai/ns-pi-subagents/api`. The recipe: register a Pi tool, and inside `execute` dispatch a child, track it in the fleet, and map the result.

```ts
import {
	dispatchRunnerSubagent,
	getOrCreateSubagentFleetRegistry,
	resultDiagnostic,
	trackSingleSubagentFleetRun,
	type RunnerSubagentTerminalToolDefinition,
} from "@nseng-ai/ns-pi-subagents/api";

interface AuditSubmission {
	findings: string[];
}

const submitAuditTool: RunnerSubagentTerminalToolDefinition<AuditSubmission> = {
	name: "submit_audit",
	status: "completed",
	description: "Submit the finished audit findings.",
	parameters: {
		type: "object",
		properties: { findings: { type: "array", items: { type: "string" } } },
		required: ["findings"],
	},
};

pi.registerTool({
	name: "audit_file",
	// ...label, description, parameters...
	promptSnippet: "Delegate a single-file audit to a focused subagent.",
	promptGuidelines: [
		"Use audit_file when asked to audit one file; read directly for quick spot checks.",
		"Treat a non-completed audit_file result as a failure to investigate, not as an empty audit.",
	],
	async execute(input, ctx) {
		const registry = getOrCreateSubagentFleetRegistry(pi);
		const tracking = trackSingleSubagentFleetRun({
			registry,
			ctx,
			title: `Audit: ${input.path}`,
			parentSessionFile: ctx.sessionManager?.getSessionFile?.(),
		});
		try {
			tracking.onStart();
			const result = await dispatchRunnerSubagent<AuditSubmission>(
				pi,
				{ cwd: ctx.cwd, signal: ctx.signal },
				{
					title: `Audit: ${input.path}`,
					prompt: buildAuditPrompt(input.path),
					returnMode: "terminal",
					terminalTools: [submitAuditTool],
					tools: ["read", "grep", "submit_audit"],
					onProgress: (update) => tracking.onProgress(update),
				},
			);
			tracking.onDone(result);
			if (result.status === "completed") {
				return renderFindings(result.terminal.input);
			}
			return renderFailure(resultDiagnostic(result) ?? result.status);
		} finally {
			tracking.dispose();
		}
	},
});
```

### Return modes

Every dispatch chooses how the child reports back:

- **`returnMode: "terminal"`** (the default) — you define one or more terminal tools (`RunnerSubagentTerminalToolDefinition`): a name, a JSON-Schema `parameters` object, and a `status` of `"completed"` or `"blocked"`. The child finishes by calling one; the validated input comes back typed on `result.terminal.input`. Terminal tools are capture-only — calling one records the payload and stops the child; it performs no domain side effects. At least one terminal tool is required, and the `tools` allowlist must include every terminal tool name.
- **`returnMode: "final-text"`** — the child's last assistant text comes back as `result.finalText`. Use this for prose deliverables or when the real contract is elsewhere (e.g. a report file the child writes).

### Dispatch options

`dispatchRunnerSubagent(pi, ctx, options)` takes a context — `cwd` (required), plus optional `signal` and inherited parent `model` — and options:

| Option          | Required         | Meaning                                                                                                                                                                                                                                              |
| --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`        | yes              | The child's entire task context. The parent supplies everything; the child starts cold.                                                                                                                                                              |
| `title`         | no               | Display title for progress, fleet, and results.                                                                                                                                                                                                      |
| `returnMode`    | no               | `"terminal"` (default, requires `terminalTools`) or `"final-text"`.                                                                                                                                                                                  |
| `terminalTools` | in terminal mode | Structured completion tools; see above.                                                                                                                                                                                                              |
| `tools`         | no               | Child `--tools` allowlist. Empty array means `--no-tools`. Omit for the child's default tools. Must include terminal tool names.                                                                                                                     |
| `model`         | no               | Fully-qualified `provider/model` selects that provider. An unqualified id inherits the parent's provider — and errors with a diagnostic if it looks like another provider family's shorthand. Omit to inherit the parent's model and thinking level. |
| `cwd`           | no               | Overrides `ctx.cwd` for the child process.                                                                                                                                                                                                           |
| `signal`        | no               | Merged with `ctx.signal`; abort sends SIGTERM, then SIGKILL after a grace period.                                                                                                                                                                    |
| `onProgress`    | no               | Receives `RunnerSubagentUpdate` values: metadata-only progress (state, tool/turn counts, elapsed, session file) plus display-only activity previews.                                                                                                 |

There is no built-in wall-clock timeout; pass a timeout-driven `AbortSignal` if you need one (the `explore` tool budgets per breadth profile this way).

### Results

`RunnerSubagentResult` is a discriminated union on `status`:

| Status                                                    | Meaning                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| `completed` / `blocked`                                   | A terminal tool was called; payload on `result.terminal.input`. |
| `final-text`                                              | Final-text mode succeeded; text on `result.finalText`.          |
| `stopped-without-terminal`, `stopped-without-useful-text` | The child stopped without fulfilling its contract.              |
| `cancelled`                                               | An abort signal fired.                                          |
| `error`, `protocol-error`                                 | Process or JSON-protocol failure.                               |

Every result carries `elapsedMs`, final `progress`, and — when available — `sessionFile` and post-run token `usage` read from the child session. `resultDiagnostic(result)` yields a human-readable diagnostic for every non-success status. For recovery flows, `extractRunnerSubagentToolCallPayloadsFromSessionJsonl` can re-read terminal payloads straight from the child transcript.

Handle the full union: a subagent tool should surface the diagnostic and session file on failure rather than swallowing them.

### Fleet tracking

Custom subagent tools must report into the shared fleet — the single per-process registry is what makes the fleet widget and `/ns:agents:fleet` a complete view of every child session:

- `getOrCreateSubagentFleetRegistry(pi)` — one registry per Pi process (idempotent, keyed on the `pi` object).
- `trackSingleSubagentFleetRun({ registry, ctx, title, prompt?, parentSessionFile })` — for one child: call `onStart()`, forward `onProgress(update)`, call `onDone(result)`, and `dispose()` in a `finally`.
- `trackSubagentFleetRun({ registry, ctx, tasks, parentSessionFile })` — for a batch: `markRunning(index)`, `markProgress(index, update)`, `markDone(index, result)`, `dispose()`.

Widget and status rendering, task icons, recent-task eviction, and cleanup of tasks left unfinished at `dispose()` are all automatic once tracking is open. Fleet display is the supported progress surface; per-tool widgets beyond it are currently a lower-level concern (see Open questions).

### Steering the parent agent

A subagent tool is only useful if the parent agent knows when to reach for it. Pi renders every registered tool's `promptSnippet` (a one-line system-prompt snippet) and `promptGuidelines` (guideline bullets) into the parent session's system prompt — this is the designed steering channel, and custom subagent tools must provide both. State when to reach for the tool, when to do the work directly instead, and how to treat its results. A tool without parent-facing guidelines ships silent and gets under-used or misused.

For the built-in tools, this steering text lives in the agent definition files (`.ns/pi/agents/explorer.md`, `.ns/pi/agents/runner.md`) — editable and validated at registration (every explore guideline must mention "explore"), with a fallback that swaps in an "unavailable" guideline when a definition is broken.

Cross-tool delegation doctrine — when to delegate at all and how to choose between subagent tools — currently lives in the consumer repo's `AGENTS.md` ("Subagent delegation" section, one subsection per subagent type). The designed promotion path is for this extension to inject that doctrine itself via Pi's `before_agent_start` hook: a static, hardcoded, package-tested section appended once to the system prompt, conditional on which built-in tools registered healthy, so consumer repos no longer copy doctrine by hand. This injection is proposed, not yet implemented.

### Fan-out

`mapWithConcurrency` runs a batch of dispatches with a concurrency cap and shared abort handling — the same primitive the `explore` tool uses for its task fan-out.

### Testing and runtime injection

Dispatch is also available behind an explicit seam:

```ts
interface SubagentRuntime {
	dispatch(input: { pi; ctx; options }): Promise<RunnerSubagentResult>;
}
```

`createSubprocessSubagentRuntime()` is the real thing; `createFunctionSubagentRuntime(fn)` wraps any function. Accept an optional `runtime?: SubagentRuntime` in your tool's options, default it to the subprocess runtime, and tests can inject a fake that returns canned `RunnerSubagentResult` values without spawning processes. `@nseng-ai/ns-pi-subagents/runner-subagents/testing` provides additional test helpers. Subprocess dispatch is always the default; an in-process runtime is only ever selected by a caller passing it explicitly.

## Behavioral guarantees and limits

- Children launch with `--no-extensions`: a subagent cannot spawn subagents.
- Child session JSONL files are the source of truth for what a subagent did; direct result text is bounded.
- Progress is metadata plus display-only previews — transcripts never stream through the progress channel, and subagent progress never goes through `pi.sendMessage` or raw stdout.
- Filesystem policy is enforced by prompt and tool allowlist, not by an OS sandbox.
- Usage/cost metadata is collected post-run from the child session file and covers the child session only.

## Public exports

- `@nseng-ai/ns-pi-subagents/api` — the curated surface for building subagent tools and consuming fleet monitoring, runtime injection, result/update types, and transcript/session helpers. New consumers should use this.
- `@nseng-ai/ns-pi-subagents/extension` — default Pi extension entrypoint (`src/extension.ts`).
- `@nseng-ai/ns-pi-subagents/runner-subagents` — lower-level dispatch/runtime helpers and the `dispatch_runner_subagent` tool implementation; exported for existing direct consumers.
- `@nseng-ai/ns-pi-subagents/runner-subagents/testing` — runner-subagent test helpers.

## Open questions

- Per-tool progress widgets: `setRunnerSubagentWidget` is exported from `/runner-subagents`, but the line formatter it pairs with is not yet on a public surface. Until that is settled, treat fleet tracking as the supported progress display for custom tools.
- Delegation-doctrine injection: the `before_agent_start` promotion path described under "Steering the parent agent" is a settled direction but unbuilt; until it lands, doctrine reaches agents only in repos whose `AGENTS.md` carries the section.

## Further reading

- `docs/pi/runner-subagent-helper.md` — the full dispatch protocol contract: child launch shape, progress rules, result taxonomy, runner agent definition format.
- `docs/adr/0023-build-pi-explore-subagents-on-runner-subagent-substrate.md` — why explore fan-out is a thin layer over the same dispatch primitive.
- `docs/patterns/subagent-pushdown.md` — when to push work into a subagent.
- `.ns/prompts/subagent-launch.md` — cross-harness launch policy: constructing self-contained launch prompts, passing paths/locators, validating results.
- In-repo consumer examples: `ts/packages/internal/pi-tools/src/thermo-council/` (terminal tools, runtime seam, batch fleet tracking) and `.pi/extensions/objective-autorun.ts` (final-text mode, single-run tracking).
