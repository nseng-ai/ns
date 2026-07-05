import { describe, expect, test } from "vitest";

import { composePiAgentPrompt } from "@ns/pi/runtime/agent-definition";

import {
	EXPLORER_CHEAP_MODEL_SHORTHAND,
	EXPLORER_SCOUT_SECTION_HEADERS,
} from "../../src/explore/contract.ts";
import { dispatchExplorerSubagent } from "../../src/explore/dispatch.ts";
import {
	createFakeRunnerSubagentDispatcher,
	createRecordingExplorerDispatch,
	jsonLine,
	makeErrorResult,
	makeExplorerAgentDefinition,
	makeFinalTextResult,
	waitForSpawn,
} from "../../src/explore/testing.ts";
import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	type RunnerSubagentContext,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../../src/runner-subagents/extension-api.ts";

const anthropicCtx: RunnerSubagentContext = {
	cwd: "/repo",
	model: { provider: "anthropic", id: "claude-opus-4-1" },
};

const definition = makeExplorerAgentDefinition();

function explorerOptions(
	overrides: Partial<Parameters<typeof dispatchExplorerSubagent>[2]> = {},
): Parameters<typeof dispatchExplorerSubagent>[2] {
	return {
		title: "Scout widget rendering",
		prompt: "Find where widget rendering lives.",
		loadAgentDefinition: () => definition,
		isProviderAuthConfigured: () => true,
		...overrides,
	};
}

describe("dispatchExplorerSubagent", () => {
	test("dispatches a read-only final-text explorer on the cheap model", async () => {
		const recording = createRecordingExplorerDispatch([makeFinalTextResult("## Start Here")]);
		const outcome = await dispatchExplorerSubagent(
			{},
			anthropicCtx,
			explorerOptions({ dispatchSubagent: recording.dispatch }),
		);

		expect(recording.calls).toHaveLength(1);
		const call = recording.calls[0];
		expect(call?.options).toMatchObject({
			title: "Scout widget rendering",
			returnMode: "final-text",
			model: EXPLORER_CHEAP_MODEL_SHORTHAND,
		});
		expect(call?.options.tools).toEqual(["read", "grep", "find", "ls"]);
		for (const header of EXPLORER_SCOUT_SECTION_HEADERS) {
			expect(call?.options.prompt).toContain(header);
		}
		expect(call?.options.prompt).toContain("Find where widget rendering lives.");
		expect(outcome.result.status).toBe("final-text");
		expect(outcome.launchPlan).toEqual({ kind: "cheap", model: EXPLORER_CHEAP_MODEL_SHORTHAND });
		expect(outcome.failedOver).toBe(false);
		expect(outcome.definition).toBe(definition);
	});

	test("fails over once to the inherited model when the cheap attempt errors", async () => {
		const recording = createRecordingExplorerDispatch([
			makeErrorResult("Failed to spawn forked Pi process: haiku unavailable"),
			makeFinalTextResult("## Start Here"),
		]);
		const outcome = await dispatchExplorerSubagent(
			{},
			anthropicCtx,
			explorerOptions({ dispatchSubagent: recording.dispatch }),
		);

		expect(recording.calls).toHaveLength(2);
		expect(recording.calls[0]?.options.model).toBe(EXPLORER_CHEAP_MODEL_SHORTHAND);
		expect(recording.calls[1]?.options.model).toBeUndefined();
		expect(recording.calls[1]?.options.tools).toEqual(["read", "grep", "find", "ls"]);
		expect(outcome.result.status).toBe("final-text");
		expect(outcome.failedOver).toBe(true);
		expect(outcome.firstAttemptDiagnostic).toBe(
			"Failed to spawn forked Pi process: haiku unavailable",
		);
	});

	test("fails over on protocol-error results", async () => {
		const protocolError: RunnerSubagentResult = {
			status: "protocol-error",
			diagnostic: "Malformed child JSON event.",
			protocolError: { message: "Malformed child JSON event." },
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 5 },
		};
		const recording = createRecordingExplorerDispatch([
			protocolError,
			makeFinalTextResult("## Start Here"),
		]);
		const outcome = await dispatchExplorerSubagent(
			{},
			anthropicCtx,
			explorerOptions({ dispatchSubagent: recording.dispatch }),
		);

		expect(recording.calls).toHaveLength(2);
		expect(outcome.failedOver).toBe(true);
	});

	test("does not fail over on unusable-text statuses", async () => {
		const stopped: RunnerSubagentResult = {
			status: "stopped-without-useful-text",
			diagnostic: "Forked Pi process stopped without useful final text.",
			elapsedMs: 5,
			progress: { state: "stopped", toolCount: 0, turnCount: 1, elapsedMs: 5 },
		};
		const recording = createRecordingExplorerDispatch([stopped]);
		const outcome = await dispatchExplorerSubagent(
			{},
			anthropicCtx,
			explorerOptions({ dispatchSubagent: recording.dispatch }),
		);

		expect(recording.calls).toHaveLength(1);
		expect(outcome.failedOver).toBe(false);
		expect(outcome.result.status).toBe("stopped-without-useful-text");
	});

	test("does not fail over when the launch plan already inherits the parent model", async () => {
		const recording = createRecordingExplorerDispatch([makeErrorResult("spawn failed")]);
		const outcome = await dispatchExplorerSubagent(
			{},
			{ cwd: "/repo", model: { provider: "openai-codex", id: "gpt-5" } },
			explorerOptions({
				dispatchSubagent: recording.dispatch,
				isProviderAuthConfigured: () => false,
			}),
		);

		expect(recording.calls).toHaveLength(1);
		expect(recording.calls[0]?.options.model).toBeUndefined();
		expect(outcome.launchPlan).toEqual({ kind: "inherit" });
		expect(outcome.failedOver).toBe(false);
	});

	test("does not fail over after the caller aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const recording = createRecordingExplorerDispatch([makeErrorResult("aborted spawn")]);
		const outcome = await dispatchExplorerSubagent(
			{},
			anthropicCtx,
			explorerOptions({ dispatchSubagent: recording.dispatch, signal: controller.signal }),
		);

		expect(recording.calls).toHaveLength(1);
		expect(outcome.failedOver).toBe(false);
	});

	test("passes the read-only allowlist and cheap model through to the child argv", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi: RunnerSubagentPi = {
			[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies,
		};
		const running = dispatchExplorerSubagent(pi, anthropicCtx, explorerOptions());
		const call = await waitForSpawn(runner.calls);

		const childPrompt = composePiAgentPrompt(definition, {
			title: "Scout widget rendering",
			prompt: "Find where widget rendering lives.",
		});
		expect(call.args).toEqual([
			"--mode",
			"json",
			"-p",
			"--provider",
			"anthropic",
			"--model",
			"haiku",
			"--no-extensions",
			"--tools",
			"read,grep,find,ls",
			"--session",
			"/tmp/pi-runner-subagent.jsonl",
			childPrompt,
		]);

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
});
