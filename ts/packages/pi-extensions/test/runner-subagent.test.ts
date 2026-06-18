import { describe, expect, test } from "vitest";

import {
	RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES,
	dispatchRunnerSubagent,
	type RunnerSubagentBlockedResult,
	type RunnerSubagentCompletedResult,
	type RunnerSubagentContext,
	type RunnerSubagentFinalTextResult,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentTerminalToolDefinition,
} from "../src/runner-subagent.ts";
import { createFakeRunnerSubagentDispatcher, waitForSpawn } from "./runner-subagent-fakes.ts";

interface CompletionInput {
	summary: string;
}

interface BlockedInput {
	reason: string;
}

interface TypeBoxStyleObjectSchema {
	readonly type: "object";
	readonly properties: {
		readonly summary: { readonly type: "string" };
	};
	readonly required: readonly ["summary"];
}

const completionTool: RunnerSubagentTerminalToolDefinition<CompletionInput> = {
	name: "complete_runner_subagent",
	status: "completed",
	description: "Finish the runner subagent with a concise summary.",
	parameters: {
		type: "object",
		properties: {
			summary: { type: "string" },
		},
		required: ["summary"],
		additionalProperties: false,
	},
};

const blockedTool: RunnerSubagentTerminalToolDefinition<BlockedInput> = {
	name: "block_runner_subagent",
	status: "blocked",
	description: "Stop the runner subagent when progress is blocked.",
	parameters: {
		type: "object",
		properties: {
			reason: { type: "string" },
		},
		required: ["reason"],
		additionalProperties: false,
	},
};

function fakeLocalExtension(
	pi: RunnerSubagentPi,
): (ctx: RunnerSubagentContext) => Promise<RunnerSubagentResult> {
	return (ctx) =>
		dispatchRunnerSubagent(pi, ctx, {
			title: "Contract smoke test",
			prompt: "Run the delegated task and finish with a terminal tool.",
			terminalTools: [completionTool, blockedTool],
		});
}

function describeResult(result: RunnerSubagentResult<CompletionInput>): string {
	switch (result.status) {
		case "completed":
			return result.terminal.input.summary;
		case "blocked":
			return `blocked by ${result.terminal.toolName}`;
		case "final-text":
			return result.finalText;
		case "stopped-without-terminal":
			return result.diagnostic;
		case "stopped-without-useful-text":
			return result.diagnostic;
		case "cancelled":
			return result.reason ?? result.diagnostic;
		case "error":
			return result.error.message;
		case "protocol-error":
			return result.protocolError.message;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}

describe("dispatchRunnerSubagent local contract", () => {
	test("is importable and callable from fake local extension code", async () => {
		const runner = createFakeRunnerSubagentDispatcher();
		const pi: RunnerSubagentPi = { [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies };
		const ctx: RunnerSubagentContext = { cwd: "/repo" };
		const invoke = fakeLocalExtension(pi);

		const running = invoke(ctx);
		const call = await waitForSpawn(runner.calls);
		call.process.close(0);
		const result = await running;

		expect(result.status).toBe("stopped-without-terminal");
		if (result.status !== "stopped-without-terminal") return;
		expect(result.diagnostic).toContain("without terminal capture");
	});

	test("allows callers to invoke final-text mode without terminal tools", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: "/tmp/final-text-runner-subagent.jsonl",
		});
		const pi: RunnerSubagentPi = { [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies };
		const ctx: RunnerSubagentContext = { cwd: "/repo" };

		const running = dispatchRunnerSubagent(pi, ctx, {
			title: "Final-text runner subagent",
			prompt: "Do the runner subagent task and answer in final text.",
			returnMode: "final-text",
		});
		const call = await waitForSpawn(runner.calls);
		call.process.emitStdout(
			`${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done." }], stopReason: "stop" } })}\n`,
		);
		call.process.close(0);
		const result = await running;

		expect(call.args).not.toContain("--extension");
		expect(result.status).toBe("final-text");
		if (result.status !== "final-text") return;
		expect(result.finalText).toBe("Done.");
		expect(result.sessionFile).toBe("/tmp/final-text-runner-subagent.jsonl");
	});

	test("allows callers to define schema-shaped terminal tools", () => {
		const typeBoxStyleSchema: TypeBoxStyleObjectSchema = {
			type: "object",
			properties: { summary: { type: "string" } },
			required: ["summary"],
		};
		const schemaBackedTool = {
			name: "complete_with_typebox_style_schema",
			status: "completed",
			description: "Complete with a TypeBox-style schema object.",
			parameters: typeBoxStyleSchema,
		} satisfies RunnerSubagentTerminalToolDefinition<CompletionInput>;
		const terminalTools = [
			completionTool,
			blockedTool,
			schemaBackedTool,
		] satisfies readonly RunnerSubagentTerminalToolDefinition[];

		expect(terminalTools).toEqual([
			expect.objectContaining({ name: "complete_runner_subagent", status: "completed" }),
			expect.objectContaining({ name: "block_runner_subagent", status: "blocked" }),
			expect.objectContaining({ name: "complete_with_typebox_style_schema", status: "completed" }),
		]);
		expect(terminalTools[0]?.parameters).toEqual(
			expect.objectContaining({
				type: "object",
				required: ["summary"],
			}),
		);
	});

	test("supports status-based result narrowing", () => {
		const completed: RunnerSubagentCompletedResult<CompletionInput> = {
			status: "completed",
			elapsedMs: 42,
			progress: {
				state: "stopped",
				toolCount: 2,
				turnCount: 3,
				elapsedMs: 42,
			},
			terminal: {
				toolName: "complete_runner_subagent",
				toolCallId: "toolu_1",
				status: "completed",
				input: { summary: "done" },
			},
		};
		const blocked: RunnerSubagentBlockedResult<CompletionInput> = {
			status: "blocked",
			elapsedMs: 21,
			progress: {
				state: "stopped",
				toolCount: 2,
				turnCount: 1,
				elapsedMs: 21,
			},
			terminal: {
				toolName: "block_runner_subagent",
				status: "blocked",
				input: { summary: "needs input" },
			},
		};
		const finalText: RunnerSubagentFinalTextResult = {
			status: "final-text",
			elapsedMs: 7,
			progress: {
				state: "stopped",
				toolCount: 0,
				turnCount: 1,
				elapsedMs: 7,
			},
			finalText: "done in prose",
			stopReason: "stop",
		};

		expect(describeResult(completed)).toBe("done");
		expect(describeResult(blocked)).toBe("blocked by block_runner_subagent");
		expect(describeResult(finalText)).toBe("done in prose");
	});

	test("returns a deterministic stopped-without-terminal result through the injectable runner", async () => {
		const runner = createFakeRunnerSubagentDispatcher({
			sessionFile: "/tmp/contract-runner-subagent.jsonl",
			now: () => 0,
		});
		const pi: RunnerSubagentPi = { [RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]: runner.dependencies };
		const ctx: RunnerSubagentContext = { cwd: "/repo" };

		const running = dispatchRunnerSubagent(pi, ctx, {
			title: "Runner subagent task",
			prompt: "Do the runner subagent task.",
			cwd: "/repo/packages/example",
			terminalTools: [completionTool, blockedTool],
		});
		const call = await waitForSpawn(runner.calls);
		call.process.close(0);
		const result = await running;

		expect(result).toEqual({
			status: "stopped-without-terminal",
			title: "Runner subagent task",
			elapsedMs: 0,
			progress: {
				title: "Runner subagent task",
				state: "stopped",
				toolCount: 0,
				turnCount: 0,
				elapsedMs: 0,
				sessionFile: "/tmp/contract-runner-subagent.jsonl",
			},
			sessionFile: "/tmp/contract-runner-subagent.jsonl",
			usage: {
				status: "unavailable",
				source: "child-session-file",
				sessionFile: "/tmp/contract-runner-subagent.jsonl",
				reason: "no-assistant-usage",
				diagnostic:
					"Subagent child session did not contain assistant messages with usable usage metadata.",
			},
			diagnostic: "Subagent Pi stopped without terminal capture.",
		});
		expect(call.options.cwd).toBe("/repo/packages/example");
	});
});
