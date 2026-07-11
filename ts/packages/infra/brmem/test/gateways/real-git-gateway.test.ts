import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { RealGitBrmemGateway, RealGitBrmemReadGateway } from "../../src/real-git-gateway.ts";

describe("RealGitBrmemGateway", () => {
	it("constructs the read-only gateway with a plain command executor", async () => {
		const commands = new PlainRecordingCommands([
			{
				command: "git",
				args: ["for-each-ref", "--format=%(refname)", "refs/brmem/base/", "refs/brmem/ns/"],
				result: { stdout: "refs/brmem/ns/handoff/feat---x\n" },
			},
			{
				command: "git",
				args: [
					"ls-tree",
					"-r",
					"--full-tree",
					"--format=%(path)%x09%(objectname)",
					"refs/brmem/ns/handoff/feat---x",
				],
				result: { stdout: "alpha.md\tbody-sha\n" },
			},
			{
				command: "git",
				args: ["log", "--format=%cI", "--name-status", "refs/brmem/ns/handoff/feat---x"],
				result: { stdout: "2026-02-03T04:05:06Z\nA\talpha.md\n" },
			},
		]);
		const gateway = new RealGitBrmemReadGateway({
			cwd: "/work",
			commands,
			git: new InMemoryGitGateway(),
		});

		const listed = await gateway.listEntries({ namespace: "handoff", branch: "feat/x" });

		expect(listed).toMatchObject({
			type: "ok",
			value: [
				{
					namespace: "handoff",
					branch: "feat/x",
					key: "alpha.md",
					entryLocator: "refs/brmem/ns/handoff/feat---x:alpha.md",
					updatedAt: "2026-02-03T04:05:06+00:00",
				},
			],
		});
		commands.assertDone();
	});

	it("preserves read semantics on the read-only gateway", async () => {
		const commands = new PlainRecordingCommands([
			{ command: "git", args: ["cat-file", "-e", "refs/brmem/ns/handoff/feat---x:alpha.md"] },
			{
				command: "git",
				args: ["rev-parse", "refs/brmem/ns/handoff/feat---x:alpha.md"],
				result: { stdout: "blob-sha\n" },
			},
			{
				command: "git",
				args: ["cat-file", "-s", "refs/brmem/ns/handoff/feat---x:alpha.md"],
				result: { stdout: "7\n" },
			},
			{
				command: "git",
				args: ["log", "-1", "--format=%H%x09%cI", "refs/brmem/ns/handoff/feat---x"],
				result: { stdout: "commit-sha\t2026-02-03T04:05:06Z\n" },
			},
			{
				command: "git",
				args: ["show", "refs/brmem/ns/handoff/feat---x:alpha.md"],
				result: { stdout: "# Alpha\n" },
			},
			{
				command: "git",
				args: ["show", "refs/brmem/ns/handoff/feat---x:missing.md"],
				result: { code: 128 },
			},
		]);
		const gateway = new RealGitBrmemReadGateway({
			cwd: "/work",
			commands,
			git: new InMemoryGitGateway(),
		});

		expect(
			await gateway.checkEntry({ namespace: "handoff", branch: "feat/x", key: "alpha.md" }),
		).toMatchObject({
			type: "found",
			value: { headSha: "commit-sha", blobSha: "blob-sha", sizeBytes: 7 },
		});
		expect(
			await gateway.getEntry({ namespace: "handoff", branch: "feat/x", key: "alpha.md" }),
		).toEqual({ type: "found", value: { content: "# Alpha\n" } });
		expect(
			await gateway.getEntry({ namespace: "handoff", branch: "feat/x", key: "missing.md" }),
		).toEqual({ type: "missing" });
		commands.assertDone();
	});

	it("delegates current branch resolution to the injected Git gateway", async () => {
		const commands = new RecordingCommands([]);
		const git = new InMemoryGitGateway({ currentBranch: "feat/x" });
		const gateway = realGitBrmemGateway("/work", commands, git);

		expect(await gateway.currentBranch()).toEqual({ type: "ok", value: "feat/x" });
		expect(git.currentBranchCalls).toEqual([{ cwd: "/work" }]);
		expect(commands.calls).toEqual([]);
	});

	it("lists local branches in one Git scan", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads"],
				result: { stdout: "feat/x\nmain\n" },
			},
		]);
		const git = new InMemoryGitGateway();
		const gateway = realGitBrmemGateway("/work", commands, git);

		expect(await gateway.listLocalBranches()).toEqual({
			type: "ok",
			value: new Set(["feat/x", "main"]),
		});
		expect(git.localBranchPresenceCalls).toEqual([]);
		commands.assertDone();
	});

	it("lists Snapshot entry counts from refs", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["for-each-ref", "--format=%(refname)", "refs/brmem/base/", "refs/brmem/ns/"],
				result: {
					stdout: "refs/brmem/base/feat---x\nrefs/brmem/ns/handoff/old\n",
				},
			},
			{
				command: "git",
				args: ["ls-tree", "-r", "--full-tree", "--name-only", "refs/brmem/base/feat---x"],
				result: { stdout: "one.md\ntwo.md\n" },
			},
			{
				command: "git",
				args: ["ls-tree", "-r", "--full-tree", "--name-only", "refs/brmem/ns/handoff/old"],
				result: { stdout: "handoff.md\n" },
			},
		]);
		const gateway = realGitBrmemGateway("/work", commands);
		const progress: Array<{ processed: number; total: number }> = [];

		expect(
			await gateway.listSnapshots({
				onProgress: (snapshotProgress) => progress.push(snapshotProgress),
			}),
		).toEqual({
			type: "ok",
			value: [
				{
					namespace: "base",
					branch: "feat/x",
					refName: "refs/brmem/base/feat---x",
					entryCount: 2,
				},
				{
					namespace: "handoff",
					branch: "old",
					refName: "refs/brmem/ns/handoff/old",
					entryCount: 1,
				},
			],
		});
		expect(progress).toEqual([
			{ processed: 1, total: 2 },
			{ processed: 2, total: 2 },
		]);
		commands.assertDone();
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
		).toMatchObject({ type: "error", error: { code: "invalid-branch-name" } });
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
		).toMatchObject({ type: "error", error: { code: "invalid-branch-name" } });
		expect(git.validateBranchRefCalls).toEqual([{ cwd: "/work", branch: "bad branch" }]);
		expect(commands.calls).toEqual([]);
	});

	it("createEntry refuses an existing key before writing a blob", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/brmem/base/feat---x"],
				result: { stdout: "parent-sha\n" },
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
				result: { stdout: "body.md\tbody-blob\n" },
			},
		]);
		const gateway = realGitBrmemGateway("/work", commands);

		const result = await gateway.createEntry({
			namespace: "base",
			branch: "feat/x",
			key: "body.md",
			content: "new body",
		});

		expect(result).toMatchObject({ type: "error", error: { code: "key-already-exists" } });
		expect(commands.calls.some((call) => call.args[0] === "hash-object")).toBe(false);
		commands.assertDone();
	});

	it("createEntry reports snapshot_ref_changed when another writer wins the update race", async () => {
		const commands = new RecordingCommands([
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/brmem/base/feat---x"],
				result: { stdout: "old-sha\n" },
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
			},
			{
				command: "git",
				args: (args) => expect(args.slice(0, 3)).toEqual(["hash-object", "-w", "--no-filters"]),
				result: { stdout: "new-blob\n" },
			},
			{ command: "git", args: ["mktree"], result: { stdout: "new-tree\n" } },
			{
				command: "git",
				args: ["ls-tree", "-r", "--full-tree", "--format=%(path)%x09%(objectname)", "new-tree"],
				result: { stdout: "body.md\tnew-blob\n" },
			},
			{
				command: "git",
				args: ["commit-tree", "new-tree", "-p", "old-sha", "-m", "brmem create body.md"],
				result: { stdout: "new-commit\n" },
			},
			{
				command: "git",
				args: ["update-ref", "refs/brmem/base/feat---x", "new-commit", "old-sha"],
				result: { code: 1, stderr: "ref changed\n" },
			},
		]);
		const gateway = realGitBrmemGateway("/work", commands);

		const result = await gateway.createEntry({
			namespace: "base",
			branch: "feat/x",
			key: "body.md",
			content: "new body",
		});

		expect(result).toMatchObject({ type: "error", error: { code: "snapshot-ref-changed" } });
		const mktreeCall = commands.calls.find((call) => call.args[0] === "mktree");
		expect(mktreeCall?.options?.stdin).toBe("100644 blob new-blob\tbody.md\n");
		commands.assertDone();
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

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;

interface CommandStep {
	command: string;
	args: string[] | ((args: string[]) => void);
	result?: ExecResultFixture;
}

interface CommandCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

class PlainRecordingCommands implements CommandExecApi {
	readonly calls: CommandCall[] = [];
	private readonly steps: CommandStep[];

	constructor(steps: readonly CommandStep[]) {
		this.steps = [...steps];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args, options });
		const step = this.steps.shift();
		if (step === undefined) throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		expect(command).toBe(step.command);
		if (typeof step.args === "function") step.args(args);
		else expect(args).toEqual(step.args);
		return execResult(step.result);
	}

	assertDone(): void {
		expect(this.steps).toEqual([]);
	}
}

class RecordingCommands extends PlainRecordingCommands {
	readonly supportsStdin = true as const;
}

function execResult(overrides: ExecResultFixture = {}): ExecResult {
	if ("type" in overrides) return overrides;
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}
