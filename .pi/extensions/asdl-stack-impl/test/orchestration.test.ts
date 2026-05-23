import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import { formatSliceLedger } from "../src/ledger.ts";
import { startNextStackSlice } from "../src/orchestration.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";
import type { StackImplPlanResult } from "../src/stack-impl.ts";

const PLAN_CONTENT = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
  - asdl-stack-impl-extension/plan-storage
---

Branches:
- asdl-stack-impl-extension/extension-skeleton
- asdl-stack-impl-extension/plan-storage
`;

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

function planResult(): StackImplPlanResult {
	const plan = parseStackPlanMarkdown(PLAN_CONTENT);
	return {
		source: "branch-memory",
		action: "loaded",
		planBranch: "plan-branch",
		locator: { namespace: "stack-plans", key: "asdl-stack-impl-extension.md", branch: "plan-branch" },
		plan,
	};
}

describe("slice start orchestration", () => {
	test("starts the first incomplete planned branch", async () => {
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result("") },
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/asdl-stack-impl-extension/extension-skeleton"],
				result: result("", 1),
			},
			{
				command: "git",
				args: ["checkout", "-b", "asdl-stack-impl-extension/extension-skeleton", "plan-branch"],
				result: result("switched\n"),
			},
			{ command: "gt", args: ["track", "-p", "plan-branch"], result: result("tracked\n") },
			{
				command: "brmem",
				args: [
					"put",
					"asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"stack-impls",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
					"--file",
					"/tmp/ledger.md",
				],
				result: result("stored\n"),
			},
		];
		let ledgerContent = "";

		const slice = await startNextStackSlice(planResult(), {
			cwd: "/repo",
			exec: fakeExec(commands),
			writeTempFile: async (content) => {
				ledgerContent = content;
				return "/tmp/ledger.md";
			},
		});

		expect(slice.status).toBe("started");
		if (slice.status === "started") {
			expect(slice.plannedBranch).toBe("asdl-stack-impl-extension/extension-skeleton");
			expect(slice.intendedParent).toBe("plan-branch");
			expect(slice.ledgerLocator).toEqual({
				branch: "asdl-stack-impl-extension/extension-skeleton",
				namespace: "stack-impls",
				key: "asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md",
			});
			expect(slice.kickoffPrompt).toContain("Objective slug: asdl-stack-impl-extension");
			expect(slice.kickoffPrompt).toContain("Current planned branch: asdl-stack-impl-extension/extension-skeleton");
		}
		expect(ledgerContent).toContain("schema: asdl.stack-slice-ledger.v1");
		expect(ledgerContent).toContain("branch: plan-branch");
		expect(ledgerContent).toContain("key: asdl-stack-impl-extension.md");
		expect(ledgerContent).toContain(planResult().plan.sha256);
		expect(commands).toEqual([]);
	});

	test("resumes an existing branch when it has a valid ledger and no handoff", async () => {
		const plan = planResult();
		const ledger = formatSliceLedger({
			planBranch: plan.planBranch,
			planKey: plan.locator.key,
			planSha256: plan.plan.sha256,
		});
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result("") },
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/asdl-stack-impl-extension/extension-skeleton"],
				result: result(""),
			},
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"stack-impls",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"stack-impls",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result(ledger),
			},
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "git",
				args: ["checkout", "asdl-stack-impl-extension/extension-skeleton"],
				result: result("switched\n"),
			},
			{ command: "gt", args: ["track", "-p", "plan-branch"], result: result("tracked\n") },
		];

		const slice = await startNextStackSlice(plan, { cwd: "/repo", exec: fakeExec(commands) });

		expect(slice.status).toBe("started");
		if (slice.status === "started") {
			expect(slice.ledgerLocator.key).toBe(
				"asdl-stack-impl-extension/asdl-stack-impl-extension---extension-skeleton.md",
			);
		}
		expect(commands).toEqual([]);
	});

	test("reports complete when every planned branch has a handoff", async () => {
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---plan-storage.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/plan-storage",
				],
				result: result("present\n"),
			},
		];

		const slice = await startNextStackSlice(planResult(), { cwd: "/repo", exec: fakeExec(commands) });

		expect(slice.status).toBe("complete");
		expect(commands).toEqual([]);
	});

	test("stops before branch creation when the worktree is dirty", async () => {
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result(" M file.txt\n") },
		];

		await expect(startNextStackSlice(planResult(), { cwd: "/repo", exec: fakeExec(commands) })).rejects.toThrow(
			/dirty worktree/,
		);
		expect(commands).toEqual([]);
	});

	test("surfaces Graphite tracking failures with command diagnostics", async () => {
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result("") },
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/asdl-stack-impl-extension/extension-skeleton"],
				result: result("", 1),
			},
			{
				command: "git",
				args: ["checkout", "-b", "asdl-stack-impl-extension/extension-skeleton", "plan-branch"],
				result: result("switched\n"),
			},
			{ command: "gt", args: ["track", "-p", "plan-branch"], result: result("", 1, "wrong parent\n") },
		];

		await expect(startNextStackSlice(planResult(), { cwd: "/repo", exec: fakeExec(commands) })).rejects.toThrow(
			/gt track -p plan-branch/,
		);
		expect(commands).toEqual([]);
	});

	test("uses the previous planned branch and handoff locator for later slices", async () => {
		const commands: ExpectedCommand[] = [
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---plan-storage.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-impl-extension/plan-storage",
				],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result("") },
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/asdl-stack-impl-extension/plan-storage"],
				result: result("", 1),
			},
			{
				command: "git",
				args: [
					"checkout",
					"-b",
					"asdl-stack-impl-extension/plan-storage",
					"asdl-stack-impl-extension/extension-skeleton",
				],
				result: result("switched\n"),
			},
			{
				command: "gt",
				args: ["track", "-p", "asdl-stack-impl-extension/extension-skeleton"],
				result: result("tracked\n"),
			},
			{
				command: "brmem",
				args: [
					"put",
					"asdl-stack-impl-extension/asdl-stack-impl-extension---plan-storage.md",
					"--namespace",
					"stack-impls",
					"--branch",
					"asdl-stack-impl-extension/plan-storage",
					"--file",
					"/tmp/ledger.md",
				],
				result: result("stored\n"),
			},
		];

		const slice = await startNextStackSlice(planResult(), {
			cwd: "/repo",
			exec: fakeExec(commands),
			writeTempFile: async () => "/tmp/ledger.md",
		});

		expect(slice.status).toBe("started");
		if (slice.status === "started") {
			expect(slice.intendedParent).toBe("asdl-stack-impl-extension/extension-skeleton");
			expect(slice.kickoffPrompt).toContain(
				"Previous handoff locator: session-artifacts/handoffs/asdl-stack-impl-extension-asdl-stack-impl-extension---extension-skeleton.md on branch asdl-stack-impl-extension/extension-skeleton",
			);
		}
		expect(commands).toEqual([]);
	});
});
