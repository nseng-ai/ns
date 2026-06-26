import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@sdl/core/exec";
import { InMemoryGitGateway } from "@sdl/core/git/testing";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";

describe("RealGitBrmemGateway", () => {
	it("delegates current branch resolution to the injected Git gateway", async () => {
		const commands = new RecordingCommands([]);
		const git = new InMemoryGitGateway({ currentBranch: "feat/x" });
		const gateway = realGitBrmemGateway("/work", commands, git);

		expect(await gateway.currentBranch()).toEqual({ type: "ok", value: "feat/x" });
		expect(git.currentBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(commands.calls).toEqual([]);
	});

	it("short-circuits Branch Memory branch encoding validation before Git ref validation", async () => {
		const commands = new RecordingCommands([]);
		const git = new InMemoryGitGateway();
		const gateway = realGitBrmemGateway("/work", commands, git);

		expect(
			await gateway.putEntry({
				namespace: "base",
				branch: "bad---branch",
				key: "body.md",
				content: "body",
			}),
		).toMatchObject({ type: "error", error: { code: "invalid_branch_name" } });
		expect(git.validateBranchRefCalls).toEqual([]);
		expect(commands.calls).toEqual([]);
	});

	it("maps delegated Git branch-ref validation failures to brmem branch errors", async () => {
		const commands = new RecordingCommands([]);
		const git = new InMemoryGitGateway({ invalidBranchRefs: ["bad branch"] });
		const gateway = realGitBrmemGateway("/work", commands, git);

		expect(
			await gateway.putEntry({
				namespace: "base",
				branch: "bad branch",
				key: "body.md",
				content: "body",
			}),
		).toMatchObject({ type: "error", error: { code: "invalid_branch_name" } });
		expect(git.validateBranchRefCalls).toEqual([{ cwd: "/work", branch: "bad branch" }]);
		expect(commands.calls).toEqual([]);
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
				args: [
					"ls-tree",
					"-r",
					"--full-tree",
					"--format=%(path)%x09%(objectname)",
					"refs/brmem/base/feat---x",
				],
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
		const gateway = realGitBrmemGateway("/work", commands);

		const listed = await gateway.listEntries({ namespace: "base", branch: "feat/x" });

		expect(listed).toMatchObject({ type: "ok" });
		if (listed.type !== "ok") throw new Error("unexpected list error");
		expect(listed.value.map((entry) => ({ key: entry.key, updatedAt: entry.updatedAt }))).toEqual([
			{ key: "body.md", updatedAt: "2026-02-03T04:05:06+00:00" },
			{ key: "nested/plan.md", updatedAt: "2026-02-03T04:06:07+00:00" },
		]);
	});

	it("builds Snapshot trees with git mktree stdin", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/brmem/base/source"],
				result: { stdout: "source-sha\n" },
			},
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/brmem/base/dest"],
				result: { code: 1 },
			},
			{
				command: "git",
				args: [
					"ls-tree",
					"-r",
					"--full-tree",
					"--format=%(path)%x09%(objectname)",
					"refs/brmem/base/source",
				],
				result: { stdout: "foo.md\tblob-sha\n" },
			},
			{ command: "git", args: ["mktree"], result: { stdout: "tree-sha\n" } },
			{
				command: "git",
				args: ["ls-tree", "-r", "--full-tree", "--format=%(path)%x09%(objectname)", "tree-sha"],
				result: { stdout: "foo.md\tblob-sha\n" },
			},
			{
				command: "git",
				args: [
					"commit-tree",
					"tree-sha",
					"-m",
					"brmem copy --base --from-branch source --to-branch dest --key-glob foo.md",
				],
				result: { stdout: "commit-sha\n" },
			},
			{
				command: "git",
				args: [
					"update-ref",
					"refs/brmem/base/dest",
					"commit-sha",
					"0000000000000000000000000000000000000000",
				],
			},
		]);
		const gateway = realGitBrmemGateway("/work", commands);

		expect(
			(
				await gateway.copyEntries({
					namespace: "base",
					fromBranch: "source",
					toBranch: "dest",
					shouldOverwrite: true,
					keyGlob: "foo.md",
				})
			).type,
		).toBe("ok");
		const mktreeCall = commands.calls.find((call) => call.args[0] === "mktree");
		expect(mktreeCall?.options?.stdin).toBe("100644 blob blob-sha\tfoo.md\n");
		expect(commands.calls.some((call) => call.args[0] === "read-tree")).toBe(false);
		expect(commands.calls.some((call) => call.args[0] === "update-index")).toBe(false);
		expect(commands.calls.some((call) => call.args[0] === "write-tree")).toBe(false);
	});

	it("normalizes UTC timestamps from Git when checking an Entry", async () => {
		const commands = new RecordingCommands([
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
		const gateway = realGitBrmemGateway("/work", commands);

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

function realGitBrmemGateway(
	cwd: string,
	commands: RecordingCommands,
	git = new InMemoryGitGateway(),
): RealGitBrmemGateway {
	return new RealGitBrmemGateway({ cwd, commands, git });
}

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
	readonly supportsStdin = true as const;
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
