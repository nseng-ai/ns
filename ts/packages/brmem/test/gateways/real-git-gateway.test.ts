import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";

describe("RealGitBrmemGateway", () => {
	it("runs git through the injected command executor", async () => {
		const commands = new RecordingCommands([
			{ command: "git", args: ["branch", "--show-current"], result: { stdout: "feat/x\n" } },
		]);
		const gateway = new RealGitBrmemGateway("/work", commands);

		expect(await gateway.currentBranch()).toEqual({ type: "ok", value: "feat/x" });
		expect(commands.calls).toEqual([
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: "/work", env: process.env },
			},
		]);
	});

	it("normalizes UTC timestamps from Git when listing Entries", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["for-each-ref", "--format=%(refname)", "refs/brmem/base/", "refs/brmem/ns/"],
				result: { stdout: "refs/brmem/base/feat---x\n" },
			},
			{
				command: "git",
				args: ["ls-tree", "-r", "--format=%(path)%x09%(objectname)", "refs/brmem/base/feat---x"],
				result: { stdout: "body.md\tbody-sha\nnested/plan.md\tplan-sha\n" },
			},
			{
				command: "git",
				args: ["log", "--format=%cI", "--name-status", "refs/brmem/base/feat---x"],
				result: {
					stdout: "2026-02-03T04:06:07Z\nA\tnested/plan.md\n\n2026-02-03T04:05:06Z\nA\tbody.md\n",
				},
			},
		]);
		const gateway = new RealGitBrmemGateway("/work", commands);

		const listed = await gateway.listEntries({ namespace: "base", branch: "feat/x" });

		expect(listed).toMatchObject({ type: "ok" });
		if (listed.type !== "ok") throw new Error("unexpected list error");
		expect(listed.value.map((entry) => ({ key: entry.key, updatedAt: entry.updatedAt }))).toEqual([
			{ key: "body.md", updatedAt: "2026-02-03T04:05:06+00:00" },
			{ key: "nested/plan.md", updatedAt: "2026-02-03T04:06:07+00:00" },
		]);
	});

	it("normalizes UTC timestamps from Git when checking an Entry", async () => {
		const commands = new RecordingCommands([
			{ command: "git", args: ["check-ref-format", "--branch", "feat/x"] },
			{ command: "git", args: ["cat-file", "-e", "refs/brmem/base/feat---x:body.md"] },
			{
				command: "git",
				args: ["rev-parse", "refs/brmem/base/feat---x:body.md"],
				result: { stdout: "blob-sha\n" },
			},
			{
				command: "git",
				args: ["cat-file", "-s", "refs/brmem/base/feat---x:body.md"],
				result: { stdout: "5\n" },
			},
			{
				command: "git",
				args: ["log", "-1", "--format=%H%x09%cI", "refs/brmem/base/feat---x"],
				result: { stdout: "commit-sha\t2026-02-03T04:05:06.000Z\n" },
			},
		]);
		const gateway = new RealGitBrmemGateway("/work", commands);

		const checked = await gateway.checkEntry({
			namespace: "base",
			branch: "feat/x",
			key: "body.md",
		});

		expect(checked).toMatchObject({
			type: "found",
			value: { headDate: "2026-02-03T04:05:06+00:00" },
		});
	});
});

interface CommandStep {
	command: string;
	args: string[];
	result?: Partial<ExecResult> | undefined;
}

interface CommandCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class RecordingCommands implements CommandExecApi {
	readonly calls: CommandCall[] = [];
	private readonly steps: CommandStep[];

	constructor(steps: readonly CommandStep[]) {
		this.steps = [...steps];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args, options });
		const step = this.steps.shift();
		if (step === undefined) throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		expect({ command, args }).toEqual({ command: step.command, args: step.args });
		return execResult(step.result);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}
