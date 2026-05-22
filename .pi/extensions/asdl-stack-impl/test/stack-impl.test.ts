import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import {
	loadOrStoreStackImplPlan,
	type StackImplFileSystem,
	type StackImplPlanResult,
} from "../src/stack-impl.ts";

const VALID_PLAN = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

Slice: asdl-stack-impl-extension/extension-skeleton
`;

const DIFFERENT_PLAN = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

Different body for asdl-stack-impl-extension/extension-skeleton
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

function localPlanFileSystem(content: string, existingPath = "/repo/plan.md"): StackImplFileSystem {
	return {
		async isFile(path) {
			return path === existingPath;
		},
		async readTextFile(path) {
			expect(path).toBe(existingPath);
			return content;
		},
	};
}

async function expectNoRemainingCommands(commands: ExpectedCommand[]): Promise<void> {
	expect(commands).toEqual([]);
}

describe("/stack-impl plan storage", () => {
	test("stores an absent local plan in Branch Memory", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("", 1),
			},
			{
				command: "brmem",
				args: [
					"put",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
					"--file",
					"/repo/plan.md",
				],
				result: result("stored\n"),
			},
		];

		const loaded = await loadOrStoreStackImplPlan("plan.md", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: localPlanFileSystem(VALID_PLAN),
		});

		expect(loaded.action).toBe("stored");
		expect(loaded.locator).toEqual({
			branch: "plan-branch",
			namespace: "stack-plans",
			key: "asdl-stack-impl-extension.md",
		});
		await expectNoRemainingCommands(commands);
	});

	test("reuses identical existing Branch Memory content", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(VALID_PLAN),
			},
		];

		const loaded = await loadOrStoreStackImplPlan("plan.md", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: localPlanFileSystem(VALID_PLAN),
		});

		expect(loaded.action).toBe("reused");
		await expectNoRemainingCommands(commands);
	});

	test("replaces differing content after UI confirmation", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(DIFFERENT_PLAN),
			},
			{
				command: "brmem",
				args: [
					"put",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
					"--file",
					"/repo/plan.md",
				],
				result: result("stored\n"),
			},
		];

		const loaded = await loadOrStoreStackImplPlan("plan.md", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: localPlanFileSystem(VALID_PLAN),
			confirmReplace: async () => true,
		});

		expect(loaded.action).toBe("replaced");
		await expectNoRemainingCommands(commands);
	});

	test("fails closed on differing content without confirmation", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(DIFFERENT_PLAN),
			},
		];

		await expect(
			loadOrStoreStackImplPlan("plan.md", {
				cwd: "/repo",
				exec: fakeExec(commands),
				fileSystem: localPlanFileSystem(VALID_PLAN),
			}),
		).rejects.toThrow(/--replace/);
		await expectNoRemainingCommands(commands);
	});

	test("loads an existing Branch Memory plan key", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(VALID_PLAN),
			},
		];

		const loaded: StackImplPlanResult = await loadOrStoreStackImplPlan(
			"asdl-stack-impl-extension.md",
			{
				cwd: "/repo",
				exec: fakeExec(commands),
				fileSystem: localPlanFileSystem(VALID_PLAN, "/repo/not-the-arg.md"),
			},
		);

		expect(loaded.source).toBe("branch-memory");
		expect(loaded.action).toBe("loaded");
		expect(loaded.plan.sha256).toMatch(/^[0-9a-f]{64}$/);
		await expectNoRemainingCommands(commands);
	});

	test("surfaces brmem command failures", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("", 2, "brmem exploded\n"),
			},
		];

		await expect(
			loadOrStoreStackImplPlan("plan.md", {
				cwd: "/repo",
				exec: fakeExec(commands),
				fileSystem: localPlanFileSystem(VALID_PLAN),
			}),
		).rejects.toThrow(/Command failed/);
		await expectNoRemainingCommands(commands);
	});

	test("rejects invalid local plans before writing Branch Memory", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
		];

		await expect(
			loadOrStoreStackImplPlan("plan.md", {
				cwd: "/repo",
				exec: fakeExec(commands),
				fileSystem: localPlanFileSystem("---\nschema: nope\n---\n\nbody\n"),
			}),
		).rejects.toThrow(/schema must be exactly/);
		await expectNoRemainingCommands(commands);
	});
});
