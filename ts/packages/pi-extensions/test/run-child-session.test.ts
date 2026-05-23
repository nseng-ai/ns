import { describe, expect, test } from "bun:test";

import {
	runChildSession,
	type ChildSessionBlockedResult,
	type ChildSessionCompletedResult,
	type ChildSessionContext,
	type ChildSessionPi,
	type ChildSessionResult,
	type ChildSessionTerminalToolDefinition,
} from "../src/run-child-session.ts";

type CompletionInput = {
	summary: string;
};

type BlockedInput = {
	reason: string;
};

type TypeBoxStyleObjectSchema = {
	readonly type: "object";
	readonly properties: {
		readonly summary: { readonly type: "string" };
	};
	readonly required: readonly ["summary"];
};

const completionTool: ChildSessionTerminalToolDefinition<CompletionInput> = {
	name: "complete_child_session",
	status: "completed",
	description: "Finish the child session with a concise summary.",
	parameters: {
		type: "object",
		properties: {
			summary: { type: "string" },
		},
		required: ["summary"],
		additionalProperties: false,
	},
};

const blockedTool: ChildSessionTerminalToolDefinition<BlockedInput> = {
	name: "block_child_session",
	status: "blocked",
	description: "Stop the child session when progress is blocked.",
	parameters: {
		type: "object",
		properties: {
			reason: { type: "string" },
		},
		required: ["reason"],
		additionalProperties: false,
	},
};

function fakeLocalExtension(pi: ChildSessionPi): (ctx: ChildSessionContext) => Promise<ChildSessionResult> {
	return (ctx) =>
		runChildSession(pi, ctx, {
			title: "Contract smoke test",
			prompt: "Run the delegated task and finish with a terminal tool.",
			terminalTools: [completionTool, blockedTool],
		});
}

function describeResult(result: ChildSessionResult<CompletionInput>): string {
	switch (result.status) {
		case "completed":
			return result.terminal.input.summary;
		case "blocked":
			return `blocked by ${result.terminal.toolName}`;
		case "stopped-without-terminal":
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

describe("runChildSession local contract", () => {
	test("is importable and callable from fake local extension code", async () => {
		const pi: ChildSessionPi = {};
		const ctx: ChildSessionContext = { cwd: "/repo" };
		const invoke = fakeLocalExtension(pi);

		const result = await invoke(ctx);

		if (result.status !== "error") {
			throw new Error(`Expected placeholder error, got ${result.status}`);
		}
		expect(result.diagnostic).toContain("not implemented yet");
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
		} satisfies ChildSessionTerminalToolDefinition<CompletionInput>;
		const terminalTools = [completionTool, blockedTool, schemaBackedTool] satisfies readonly ChildSessionTerminalToolDefinition[];

		expect(terminalTools).toEqual([
			expect.objectContaining({ name: "complete_child_session", status: "completed" }),
			expect.objectContaining({ name: "block_child_session", status: "blocked" }),
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
		const completed: ChildSessionCompletedResult<CompletionInput> = {
			status: "completed",
			elapsedMs: 42,
			progress: {
				state: "stopped",
				toolCount: 2,
				turnCount: 3,
				elapsedMs: 42,
			},
			terminal: {
				toolName: "complete_child_session",
				toolCallId: "toolu_1",
				status: "completed",
				input: { summary: "done" },
			},
		};
		const blocked: ChildSessionBlockedResult<CompletionInput> = {
			status: "blocked",
			elapsedMs: 21,
			progress: {
				state: "stopped",
				toolCount: 2,
				turnCount: 1,
				elapsedMs: 21,
			},
			terminal: {
				toolName: "block_child_session",
				status: "blocked",
				input: { summary: "needs input" },
			},
		};

		expect(describeResult(completed)).toBe("done");
		expect(describeResult(blocked)).toBe("blocked by block_child_session");
	});

	test("returns a deterministic not-implemented error without provider or subprocess work", async () => {
		const pi: ChildSessionPi = {
			exec() {
				throw new Error("runChildSession must not execute commands in the contract slice");
			},
		};
		const ctx: ChildSessionContext = { cwd: "/repo" };

		const result = await runChildSession(pi, ctx, {
			title: "Child task",
			prompt: "Do the child task.",
			cwd: "/repo/packages/example",
			terminalTools: [completionTool, blockedTool],
		});

		expect(result).toEqual({
			status: "error",
			title: "Child task",
			elapsedMs: 0,
			progress: {
				title: "Child task",
				state: "stopped",
				toolCount: 2,
				turnCount: 0,
				elapsedMs: 0,
			},
			diagnostic: "runChildSession is not implemented yet; child process execution will be added in a later slice.",
			error: {
				message: "runChildSession is not implemented yet; child process execution will be added in a later slice.",
				name: "NotImplementedError",
			},
		});
	});
});
