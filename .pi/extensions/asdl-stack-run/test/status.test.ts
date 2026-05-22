import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import { formatSliceLedger } from "../src/ledger.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";
import { buildStackStatusReport, formatStackStatusReport } from "../src/status.ts";

const PLAN_CONTENT = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-run-extension
planned_branches:
  - asdl-stack-run-extension/extension-skeleton
  - asdl-stack-run-extension/plan-storage
---

Branches:
- asdl-stack-run-extension/extension-skeleton
- asdl-stack-run-extension/plan-storage
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
			planKey: "asdl-stack-run-extension.md",
			planSha256: plan.sha256,
		});
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: ["get", "asdl-stack-run-extension.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(PLAN_CONTENT),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result(" M file.ts\n") },
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/heads/asdl-stack-run-extension/extension-skeleton"],
				result: result("commit\n"),
			},
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-run-extension/asdl-stack-run-extension---extension-skeleton.md",
					"--namespace",
					"stack-runs",
					"--branch",
					"asdl-stack-run-extension/extension-skeleton",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"asdl-stack-run-extension/asdl-stack-run-extension---extension-skeleton.md",
					"--namespace",
					"stack-runs",
					"--branch",
					"asdl-stack-run-extension/extension-skeleton",
				],
				result: result(ledger),
			},
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-run-extension-asdl-stack-run-extension---extension-skeleton.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-run-extension/extension-skeleton",
				],
				result: result("present\n"),
			},
			{
				command: "gt",
				args: ["branch", "info", "asdl-stack-run-extension/extension-skeleton"],
				result: result("asdl-stack-run-extension/extension-skeleton\n\nParent: plan-branch\n"),
			},
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/heads/asdl-stack-run-extension/plan-storage"],
				result: result("", 1),
			},
			{
				command: "brmem",
				args: [
					"check",
					"asdl-stack-run-extension/asdl-stack-run-extension---plan-storage.md",
					"--namespace",
					"stack-runs",
					"--branch",
					"asdl-stack-run-extension/plan-storage",
				],
				result: result("", 1),
			},
			{
				command: "brmem",
				args: [
					"check",
					"handoffs/asdl-stack-run-extension-asdl-stack-run-extension---plan-storage.md",
					"--namespace",
					"session-artifacts",
					"--branch",
					"asdl-stack-run-extension/plan-storage",
				],
				result: result("", 1),
			},
		];

		const report = await buildStackStatusReport("asdl-stack-run-extension.md", {
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

		expect(report.firstIncomplete).toBe("asdl-stack-run-extension/plan-storage");
		expect(report.warnings).toContain("dirty worktree");
		expect(formatted).toContain("- [x] asdl-stack-run-extension/extension-skeleton");
		expect(formatted).toContain("- [ ] asdl-stack-run-extension/plan-storage");
		expect(formatted).toContain("warning: missing git branch");
		expect(formatted).toContain("warning: missing stack-runs ledger");
		expect(formatted).toContain("warning: missing completion handoff");
		expect(commands).toEqual([]);
	});
});
