import { describe, expect, test } from "vitest";

import { composePiAgentPrompt } from "@nseng-ai/pi/runtime/agent-definition";

import {
	EXPLORER_CHEAP_MODEL_SHORTHAND,
	EXPLORER_SCOUT_SECTION_HEADERS,
} from "../../src/explore/contract.ts";
import {
	dispatchExplorerSubagent,
	type DispatchExplorerSubagentOptions,
	type ExplorerDispatcherDependencies,
} from "../../src/explore/dispatch.ts";
import {
	createFakeRunnerSubagentDispatcher,
	createRecordingExplorerDispatch,
	jsonLine,
	makeErrorResult,
	makeExplorerAgentDefinition,
	makeFinalTextResult,
	makeProtocolErrorResult,
	makeStoppedWithoutUsefulTextResult,
	stoppedProgress,
	waitForSpawn,
} from "../../src/explore/testing.ts";
import { READ_ONLY_SUBAGENT_TOOLS } from "@internal/pi-tools/runner-subagents";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentStatus,
} from "@internal/pi-tools/runner-subagents";

const anthropicCtx: RunnerSubagentContext = {
	cwd: "/repo",
	model: { provider: "anthropic", id: "claude-opus-4-1" },
};

const definition = makeExplorerAgentDefinition();

function explorerIntent(
	overrides: Partial<DispatchExplorerSubagentOptions> = {},
): DispatchExplorerSubagentOptions {
	return {
		title: "Scout widget rendering",
		prompt: "Find where widget rendering lives.",
		...overrides,
	};
}

type ExplorerDispatchTestDependencies = ExplorerDispatcherDependencies;

function explorerDispatcher(dependencies: ExplorerDispatchTestDependencies = {}) {
	return (
		pi: RunnerSubagentPi,
		ctx: RunnerSubagentContext,
		intent: DispatchExplorerSubagentOptions,
	) =>
		dispatchExplorerSubagent({
			pi,
			ctx,
			intent,
			dependencies: {
				loadAgentDefinition: () => definition,
				isProviderAuthConfigured: () => true,
				...dependencies,
			},
		});
}

function flagValue(args: readonly string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1) return undefined;
	return args[index + 1];
}

function makeResultWithStatus(status: RunnerSubagentStatus): RunnerSubagentResult {
	const progress = stoppedProgress();
	switch (status) {
		case "completed":
			return {
				status,
				terminal: { toolName: "complete", status, input: {} },
				elapsedMs: 5,
				progress,
			};
		case "blocked":
			return {
				status,
				terminal: { toolName: "block", status, input: {} },
				elapsedMs: 5,
				progress,
			};
		case "final-text":
			return { status, finalText: "Done.", elapsedMs: 5, progress };
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
		case "cancelled":
			return { status, diagnostic: `${status} diagnostic`, elapsedMs: 5, progress };
		case "error":
			return {
				status,
				diagnostic: "error diagnostic",
				error: { message: "error diagnostic" },
				elapsedMs: 5,
				progress,
			};
		case "protocol-error":
			return makeProtocolErrorResult("protocol diagnostic");
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

describe("dispatchExplorerSubagent", () => {
	test("dispatches a read-only final-text explorer on the cheap model", async () => {
		const recording = createRecordingExplorerDispatch([makeFinalTextResult("## Start Here")]);
		const dispatch = explorerDispatcher({ dispatchSubagent: recording.dispatch });
		const outcome = await dispatch({}, anthropicCtx, explorerIntent());

		expect(recording.calls).toHaveLength(1);
		const call = recording.calls[0];
		expect(call?.options).toMatchObject({
			title: "Scout widget rendering",
			returnMode: "final-text",
			model: EXPLORER_CHEAP_MODEL_SHORTHAND,
		});
		expect(call?.options.tools).toEqual([...READ_ONLY_SUBAGENT_TOOLS]);
		for (const header of EXPLORER_SCOUT_SECTION_HEADERS) {
			expect(call?.options.prompt).toContain(header);
		}
		expect(call?.options.prompt).toContain("Find where widget rendering lives.");
		expect(outcome.result.status).toBe("final-text");
		expect(outcome.launchPlan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_MODEL_SHORTHAND });
		expect(outcome.failover).toBeUndefined();
		expect(outcome.definition).toBe(definition);
	});

	test("fails over once to the inherited model when the cheap attempt errors", async () => {
		const recording = createRecordingExplorerDispatch([
			makeErrorResult("Failed to spawn forked Pi process: haiku unavailable"),
			makeFinalTextResult("## Start Here"),
		]);
		const dispatch = explorerDispatcher({ dispatchSubagent: recording.dispatch });
		const outcome = await dispatch({}, anthropicCtx, explorerIntent());

		expect(recording.calls).toHaveLength(2);
		expect(recording.calls[0]?.options.model).toBe(EXPLORER_CHEAP_MODEL_SHORTHAND);
		expect(recording.calls[1]?.options.model).toBeUndefined();
		expect(recording.calls[1]?.options.tools).toEqual([...READ_ONLY_SUBAGENT_TOOLS]);
		expect(outcome.result.status).toBe("final-text");
		expect(outcome.failover).toEqual({
			firstAttemptStatus: "error",
			firstAttemptDiagnostic: "Failed to spawn forked Pi process: haiku unavailable",
		});
	});

	test("fails over on protocol-error results", async () => {
		const recording = createRecordingExplorerDispatch([
			makeProtocolErrorResult("Malformed child JSON event."),
			makeFinalTextResult("## Start Here"),
		]);
		const dispatch = explorerDispatcher({ dispatchSubagent: recording.dispatch });
		const outcome = await dispatch({}, anthropicCtx, explorerIntent());

		expect(recording.calls).toHaveLength(2);
		expect(outcome.failover?.firstAttemptStatus).toBe("protocol-error");
	});

	test("does not fail over on unusable-text statuses", async () => {
		const recording = createRecordingExplorerDispatch([
			makeStoppedWithoutUsefulTextResult("Forked Pi process stopped without useful final text."),
		]);
		const dispatch = explorerDispatcher({ dispatchSubagent: recording.dispatch });
		const outcome = await dispatch({}, anthropicCtx, explorerIntent());

		expect(recording.calls).toHaveLength(1);
		expect(outcome.failover).toBeUndefined();
		expect(outcome.result.status).toBe("stopped-without-useful-text");
	});

	test("does not fail over when the launch plan already inherits the parent model", async () => {
		const recording = createRecordingExplorerDispatch([makeErrorResult("spawn failed")]);
		const dispatch = explorerDispatcher({
			dispatchSubagent: recording.dispatch,
			isProviderAuthConfigured: () => false,
		});
		const outcome = await dispatch(
			{},
			{ cwd: "/repo", model: { provider: "openai-codex", id: "gpt-5" } },
			explorerIntent(),
		);

		expect(recording.calls).toHaveLength(1);
		expect(recording.calls[0]?.options.model).toBeUndefined();
		expect(outcome.launchPlan).toEqual({ kind: "inherit" });
		expect(outcome.failover).toBeUndefined();
	});

	test("lets the runner-subagent dispatcher handle already-aborted callers", async () => {
		const controller = new AbortController();
		controller.abort("user cancelled");
		const runner = createFakeRunnerSubagentDispatcher();
		const pi: RunnerSubagentPi = {
			[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies,
		};
		const dispatch = explorerDispatcher();
		const outcome = await dispatch(pi, anthropicCtx, explorerIntent({ signal: controller.signal }));

		expect(runner.calls).toHaveLength(0);
		expect(outcome.result.status).toBe("cancelled");
		if (outcome.result.status !== "cancelled") return;
		expect(outcome.result.reason).toBe("user cancelled");
		expect(outcome.result.progress).toMatchObject({
			state: "stopped",
			toolCount: 0,
			turnCount: 0,
		});
		expect(outcome.failover).toBeUndefined();
	});

	test("does not fail over after the context aborts", async () => {
		const controller = new AbortController();
		const recording = createRecordingExplorerDispatch([makeErrorResult("aborted spawn")]);
		const dispatch = explorerDispatcher({
			dispatchSubagent: async (pi, ctx, options) => {
				const result = await recording.dispatch(pi, ctx, options);
				controller.abort("user cancelled");
				return result;
			},
		});
		const outcome = await dispatch(
			{},
			{ ...anthropicCtx, signal: controller.signal },
			explorerIntent(),
		);

		expect(recording.calls).toHaveLength(1);
		expect(outcome.failover).toBeUndefined();
	});

	test("passes the read-only allowlist and cheap model through to the child argv", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi: RunnerSubagentPi = {
			[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies,
		};
		const dispatch = explorerDispatcher();
		const running = dispatch(pi, anthropicCtx, explorerIntent());
		const call = await waitForSpawn(runner.calls);

		const childPrompt = composePiAgentPrompt(definition, {
			title: "Scout widget rendering",
			prompt: "Find where widget rendering lives.",
		});
		expect(flagValue(call.args, "--mode")).toBe("json");
		expect(call.args).toContain("-p");
		expect(flagValue(call.args, "--provider")).toBe("anthropic");
		expect(flagValue(call.args, "--model")).toBe("haiku");
		expect(call.args).toContain("--no-extensions");
		expect(flagValue(call.args, "--tools")).toBe(READ_ONLY_SUBAGENT_TOOLS.join(","));
		expect(flagValue(call.args, "--session")).toBe("/tmp/pi-runner-subagent.jsonl");
		expect(call.args.at(-1)).toBe(childPrompt);

		call.process.emitStdout(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "## Start Here" }],
					stopReason: "stop",
				},
			}),
		);
		call.process.close(0);
		const outcome = await running;

		expect(outcome.result.status).toBe("final-text");
	});

	test("keeps explorer transient failure policy explicit", async () => {
		const expected = {
			completed: false,
			blocked: false,
			"final-text": false,
			"stopped-without-terminal": false,
			"stopped-without-useful-text": false,
			cancelled: false,
			error: true,
			"protocol-error": true,
		} satisfies Record<RunnerSubagentStatus, boolean>;

		const statuses: RunnerSubagentStatus[] = [
			"completed",
			"blocked",
			"final-text",
			"stopped-without-terminal",
			"stopped-without-useful-text",
			"cancelled",
			"error",
			"protocol-error",
		];
		for (const status of statuses) {
			const recording = createRecordingExplorerDispatch([
				makeResultWithStatus(status),
				makeFinalTextResult("## Start Here"),
			]);
			const dispatch = explorerDispatcher({ dispatchSubagent: recording.dispatch });
			const outcome = await dispatch({}, anthropicCtx, explorerIntent());

			expect(recording.calls).toHaveLength(expected[status] ? 2 : 1);
			expect(outcome.failover !== undefined).toBe(expected[status]);
		}
	});
});
