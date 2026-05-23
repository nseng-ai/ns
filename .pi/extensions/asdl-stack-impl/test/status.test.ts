import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import { formatSliceLedger } from "../src/ledger.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";
import { buildStackStatusReport, formatStackStatusReport } from "../src/status.ts";

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

describe("stack status", () => {
	test("reports branch completeness and diagnostics", async () => {
		const plan = parseStackPlanMarkdown(PLAN_CONTENT);
		const ledger = formatSliceLedger({
			planBranch: "plan-branch",
			planKey: "asdl-stack-impl-extension.md",
			planSha256: plan.sha256,
		});
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: ["get", "asdl-stack-impl-extension.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(PLAN_CONTENT),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result(" M file.ts\n") },
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
				command: "gt",
				args: ["branch", "info", "asdl-stack-impl-extension/extension-skeleton"],
				result: result("asdl-stack-impl-extension/extension-skeleton\n\nParent: plan-branch\n"),
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/asdl-stack-impl-extension/plan-storage"],
				result: result("", 1),
			},
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-impl-extension/asdl-stack-impl-extension---plan-storage.md",
					"--namespace",
					"stack-impls",
					"--branch",
					"asdl-stack-impl-extension/plan-storage",
				],
				result: result("", 1),
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
		];

		const report = await buildStackStatusReport("asdl-stack-impl-extension.md", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: {
				async isFile() {
					return false;
				},
				async readTextFile() {
					throw new Error("not used");
				},
			},
		});
		const formatted = formatStackStatusReport(report);

		expect(report.firstIncomplete).toBe("asdl-stack-impl-extension/plan-storage");
		expect(report.warnings).toContain("dirty worktree");
		expect(formatted).toContain("- [x] asdl-stack-impl-extension/extension-skeleton");
		expect(formatted).toContain("- [ ] asdl-stack-impl-extension/plan-storage");
		expect(formatted).toContain("warning: missing git branch");
		expect(formatted).toContain("warning: missing stack-impls ledger");
		expect(formatted).toContain("warning: missing completion handoff");
		expect(commands).toEqual([]);
	});
});
