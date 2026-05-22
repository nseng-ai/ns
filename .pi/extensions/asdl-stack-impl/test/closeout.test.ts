import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import {
	closeoutStackSlice,
	takePendingCloseout,
	type StackSliceDonePayload,
} from "../src/closeout.ts";
import { formatSliceLedger } from "../src/ledger.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";

const PLAN_CONTENT = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

Branch: asdl-stack-impl-extension/extension-skeleton
`;

const CURRENT_BRANCH = "asdl-stack-impl-extension/extension-skeleton";
const LEDGER_KEY = "asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md";
const HANDOFF_KEY = "handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md";

type ExpectedCommand = {
	command: string;
	args: string[];
	result: ExecResult;
};

function result(stdout = "", code = 0, stderr = ""): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function fakeExec(expectedCommands: ExpectedCommand[]): ExecFunction {
	return async (command, args) => {
		const expected = expectedCommands.shift();
		if (!expected) {
			throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		}
		expect({ command, args }).toEqual({ command: expected.command, args: expected.args });
		return expected.result;
	};
}

function brmemListStdout(): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "stack-impls",
			branch: CURRENT_BRANCH,
			entries: [{ key: LEDGER_KEY }],
		},
	});
}

function payload(): StackSliceDonePayload {
	return {
		summary: "implemented slice",
		validation: "tests passed",
		handoff_markdown: "# Handoff\n\nDone.\n",
	};
}

describe("stack slice closeout", () => {
	test("derives the handoff key from current branch and stores handoff content", async () => {
		const plan = parseStackPlanMarkdown(PLAN_CONTENT);
		const ledger = formatSliceLedger({
			planBranch: "plan-branch",
			planKey: "asdl-stack-impl-extension.md",
			planSha256: plan.sha256,
		});
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result(`${CURRENT_BRANCH}\n`) },
			{
				command: "brmem",
				args: ["list", "--namespace", "stack-impls", "--branch", CURRENT_BRANCH, "--format", "json"],
				result: result(brmemListStdout()),
			},
			{
				command: "brmem",
				args: ["get", LEDGER_KEY, "--namespace", "stack-impls", "--branch", CURRENT_BRANCH],
				result: result(ledger),
			},
			{
				command: "brmem",
				args: ["get", "asdl-stack-impl-extension.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(PLAN_CONTENT),
			},
			{
				command: "brmem",
				args: [
					"put",
					HANDOFF_KEY,
					"--namespace",
					"session-artifacts",
					"--branch",
					CURRENT_BRANCH,
					"--file",
					"/tmp/handoff.md",
				],
				result: result("Stored handoff\nCommit: abc\n"),
			},
		];
		let storedHandoff = "";

		const closeout = await closeoutStackSlice(payload(), {
			cwd: "/repo",
			exec: fakeExec(commands),
			writeTempFile: async (content) => {
				storedHandoff = content;
				return "/tmp/handoff.md";
			},
		});

		expect(closeout).toEqual({
			branch: CURRENT_BRANCH,
			handoffNamespace: "session-artifacts",
			handoffKey: HANDOFF_KEY,
			brmemOutput: "Stored handoff\nCommit: abc",
		});
		expect(storedHandoff).toBe("# Handoff\n\nDone.\n");
		expect(commands).toEqual([]);
	});

	test("stops closeout when ledger plan hash drifts", async () => {
		const ledger = formatSliceLedger({
			planBranch: "plan-branch",
			planKey: "asdl-stack-impl-extension.md",
			planSha256: "a".repeat(64),
		});
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result(`${CURRENT_BRANCH}\n`) },
			{
				command: "brmem",
				args: ["list", "--namespace", "stack-impls", "--branch", CURRENT_BRANCH, "--format", "json"],
				result: result(brmemListStdout()),
			},
			{
				command: "brmem",
				args: ["get", LEDGER_KEY, "--namespace", "stack-impls", "--branch", CURRENT_BRANCH],
				result: result(ledger),
			},
			{
				command: "brmem",
				args: ["get", "asdl-stack-impl-extension.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(PLAN_CONTENT),
			},
		];

		await expect(closeoutStackSlice(payload(), { cwd: "/repo", exec: fakeExec(commands) })).rejects.toThrow(
			/hash drift/,
		);
		expect(commands).toEqual([]);
	});

	test("missing pending closeout payload has a recovery message", () => {
		expect(() => takePendingCloseout(new Map(), "missing-id")).toThrow(/call stack_impl_slice_done again/);
	});
});
