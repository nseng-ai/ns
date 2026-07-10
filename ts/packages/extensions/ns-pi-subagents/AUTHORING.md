# Authoring a subagent tool

This is the step-by-step guide for adding a new first-party subagent to this package.
The `README.md` is the reference (what each option/result means, in tables); this file is
the procedure (what to do, in order, with a complete worked example). Read `README.md`'s
"Building your own subagent tool" section alongside it.

> **This documents the *current* state, not an aspirational one.** Authoring a subagent
> today means hand-wiring the same boilerplate every time — registry lookup, fleet
> tracking, the `try`/`finally` `dispose`, the full result-union `switch`, the runtime seam,
> and the definition file being a dead end for anything but `runner`/`explorer`. Almost all
> of it could be far more ergonomic: a single `defineSubagentTool(...)` helper could fold in
> registration, fleet tracking, and result mapping so a new agent is a few declarative
> fields; the `.ns/pi/agents/*.md` format could become a real by-name registration surface.
> The steps below are the current mechanics you have to follow, **not** an endorsement of
> them as the ideal shape. If you find yourself copying this boilerplate a third time, that
> is the signal to build the helper instead of following this guide again.

## What you are actually building

A subagent is a real child Pi process launched for one focused task. You do **not** author
a subagent by dropping a new agent-definition file — see
[The `.ns/pi/agents/*.md` files](#the-nspiagentsmd-files) for why that path is not yet
extensible. You author one by **registering a Pi tool** whose `execute` dispatches a child
through `dispatchRunnerSubagent`, tracks it in the shared fleet, and maps the result. Import
everything from `@nseng-ai/ns-pi-subagents/api` — that is the curated surface new consumers
should use.

## Step 0 — decide whether a subagent is warranted

Delegate to a subagent when the work is a self-contained task whose full transcript should
stay out of the parent's context, and whose result is a bounded deliverable (a structured
payload or a short piece of prose). Do the work inline instead when you already know the
answer or the file, or when the parent needs to see every step. See
`docs/patterns/subagent-pushdown.md` for the decision.

## Step 1 — choose the return contract

Every dispatch reports back one of two ways. Pick before you write anything else, because
it decides the rest of the shape:

- **`returnMode: "terminal"`** (default) — the child finishes by calling exactly one
  terminal tool you define, and its validated arguments come back typed on
  `result.terminal.input`. Use this whenever the deliverable is **structured data**.
- **`returnMode: "final-text"`** — the child's last assistant message comes back as
  `result.finalText`. Use this for **prose deliverables**, or when the real artifact is a
  file the child writes and the text is just a summary.

## Step 2 — (terminal mode only) define the terminal tool(s)

A terminal tool is capture-only: calling it records the payload and stops the child; it
performs no side effects. Give it a `name`, a `status` of `"completed"` or `"blocked"`, a
`description`, and a JSON-Schema `parameters` object. At least one is required, and every
terminal tool name must also appear in the `tools` allowlist (Step 4).

```ts
import type { RunnerSubagentTerminalToolDefinition } from "@nseng-ai/ns-pi-subagents/api";

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
```

## Step 3 — register the Pi tool with parent-facing steering

A subagent tool is useless if the parent agent never reaches for it, or reaches for it
wrongly. Both `promptSnippet` (one line) and `promptGuidelines` (bullets) are **required**:
Pi renders them into the parent's system prompt. Say when to use the tool, when to do the
work directly instead, and how to treat its results (especially: a non-success status is a
failure to investigate, not an empty result).

```ts
pi.registerTool({
	name: "audit_file",
	label: "Audit file",
	description: "Delegate a single-file audit to a focused subagent.",
	parameters: {
		type: "object",
		properties: { path: { type: "string" } },
		required: ["path"],
	},
	promptSnippet: "Delegate a single-file audit to a focused subagent.",
	promptGuidelines: [
		"Use audit_file when asked to audit one file; read directly for quick spot checks.",
		"Treat a non-completed audit_file result as a failure to investigate, not an empty audit.",
	],
	async execute(input, ctx) {
		/* Steps 4–5 */
	},
});
```

## Step 4 — dispatch and fleet-track

Inside `execute`: open fleet tracking, dispatch the child, forward progress, and close
tracking in a `finally`. Fleet tracking is not optional — the shared per-process registry
is what makes the fleet widget and `/ns:agents:fleet` a complete view of every child.

```ts
import {
	dispatchRunnerSubagent,
	getOrCreateSubagentFleetRegistry,
	resultDiagnostic,
	trackSingleSubagentFleetRun,
} from "@nseng-ai/ns-pi-subagents/api";

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
				prompt: buildAuditPrompt(input.path), // the child starts cold; include ALL context
				returnMode: "terminal",
				terminalTools: [submitAuditTool],
				tools: ["read", "grep", "submit_audit"], // must include terminal tool names
				onProgress: (update) => tracking.onProgress(update),
			},
		);
		tracking.onDone(result);
		return mapResult(result); // Step 5
	} finally {
		tracking.dispose();
	}
}
```

See `README.md` for the full dispatch-option and progress tables. Key reminders: the
`prompt` is the child's *entire* context (it starts with no history); omit `model` to
inherit the parent's provider/model and thinking level; there is no built-in timeout, so
pass a timeout-driven `AbortSignal` if you need one.

## Step 5 — handle the full result union

`RunnerSubagentResult` is a discriminated union on `status`. Handle every arm — surface the
diagnostic and `sessionFile` on failure rather than swallowing them. `resultDiagnostic(result)`
gives a human-readable line for any non-success status.

```ts
function mapResult(result: RunnerSubagentResult): string {
	if (result.status === "completed") return renderFindings(result.terminal.input);
	if (result.status === "blocked") return renderBlocked(result.terminal.input);
	return renderFailure(resultDiagnostic(result) ?? result.status, result.sessionFile);
}
```

The failure statuses (`stopped-without-terminal`, `stopped-without-useful-text`,
`cancelled`, `error`, `protocol-error`) all mean the contract was not fulfilled; do not
report them to the parent as a successful-but-empty run.

## Step 6 — fan out (only if you need a batch)

For N tasks at once, use `mapWithConcurrency` (concurrency cap + shared abort) with the
batch tracker `trackSubagentFleetRun`, which exposes `markRunning(i)`, `markProgress(i, u)`,
`markDone(i, r)`, and `dispose()`. This is exactly how the built-in `explore` tool fans out.
Do not hand-roll `Promise.all` over dispatches — you lose the concurrency cap and the fleet
plumbing.

## Step 7 — test without spawning processes

Dispatch sits behind a `SubagentRuntime` seam. Accept an optional `runtime?: SubagentRuntime`
in your tool's options, default it to `createSubprocessSubagentRuntime()`, and in tests
inject `createFunctionSubagentRuntime(fn)` returning canned `RunnerSubagentResult` values.
The subprocess runtime is always the default; an in-process runtime is only ever selected by
a caller passing it explicitly. `@nseng-ai/ns-pi-subagents/runner-subagents/testing` has
additional helpers. Add Vitest coverage under `test/`; validate with `just ts-check` and
`just ts-test`.

## The `.ns/pi/agents/*.md` files

The built-in `forked_pi_agent` and `explore` tools read their parent-facing metadata and
child prompt wrapper from `.ns/pi/agents/runner.md` and `.ns/pi/agents/explorer.md`
(frontmatter: `schema: ns.pi-agent.v1`, `name`, `toolName`, `label`, `description`,
`promptSnippet`, `promptGuidelines`; body is the prompt wrapper, with `{{prompt}}` and
`{{title}}` substituted).

**This is not a general extension point.** Only `runner.md` and `explorer.md` are wired up
by name; dropping a new `.ns/pi/agents/foo.md` does nothing on its own. Additional
definition-file-driven agent variants remain future work (see
`docs/pi/runner-subagent-helper.md`). To add a new first-party agent today, register a new
tool (Steps 1–7) — which may reuse the runner substrate under the hood, exactly as the
`explore` tool does (ADR 0023).

## Checklist

- [ ] Return contract chosen (terminal vs final-text).
- [ ] Terminal tool(s) defined and their names included in `tools` (terminal mode).
- [ ] `promptSnippet` **and** `promptGuidelines` provided.
- [ ] `prompt` carries the child's entire context.
- [ ] Fleet tracked: `onStart` → `onProgress` → `onDone`, `dispose()` in `finally`.
- [ ] Every `RunnerSubagentResult` status handled; diagnostics + `sessionFile` surfaced on failure.
- [ ] `SubagentRuntime` seam accepted; tests inject a function runtime.

## Further reading

- `README.md` — reference tables for options, return modes, results, and fleet tracking.
- `docs/pi/runner-subagent-helper.md` — full dispatch protocol contract and definition-file format.
- `docs/adr/0023-build-pi-explore-subagents-on-runner-subagent-substrate.md` — why `explore` is a thin layer over the same primitive.
- `docs/patterns/subagent-pushdown.md` — when to push work into a subagent.
- Worked examples: `ts/packages/internal/pi-tools/src/thermo-council/` (terminal tools, runtime seam, batch tracking) and `.pi/extensions/objective-autorun.ts` (final-text mode, single-run tracking).
