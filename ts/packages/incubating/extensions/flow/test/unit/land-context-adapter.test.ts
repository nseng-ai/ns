import { resolve } from "node:path";

import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { createLandContext } from "../../src/land/stack/land-context-adapter.ts";
import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE } from "../../src/land/stack/constants.ts";
import { createLandGraphiteCommandChannel } from "../../src/land/stack/graphite-command-channel.ts";
import type { LandStackExtensionAPI } from "../../src/land/stack/types.ts";
import {
	formatLiveBranchTips,
	metadataDbJson,
	TOPOLOGY_COMMAND,
	topologyArgs,
} from "./land-test-helpers.ts";

const ROOT = "/repo";
const DB_PATH = `${ROOT}/.git/.graphite_metadata.db`;
const TOPOLOGY_ARGS = topologyArgs(DB_PATH);
const FOR_EACH_REF_ARGS = [...GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS];
const SQUASH_MERGE_ARGS = [
	"pr",
	"merge",
	"42",
	"--squash",
	"--match-head-commit",
	"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"--subject",
	"Merge subject",
	"--body",
	"Merge body",
];
const POST_MERGE_FACTS_ARGS = [
	"pr",
	"view",
	"42",
	"--json",
	"id,number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt",
];
const BACKUP_ROTATION_ARGS = [
	"fetch",
	"--quiet",
	"--prune",
	"--no-tags",
	".",
	`+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`,
];
const GT_MUTATION_TIMEOUT_MS = 600_000;
const REFRESH_ARGS = [
	"get",
	"feature-b",
	"--downstack",
	"--no-restack",
	"--no-checkout",
	"--force",
	"--no-interactive",
];
const DELETE_ARGS = ["delete", "feature-a", "-f", "-q"];
const RESTACK_ARGS = ["restack", "--branch", "feature-b", "--upstack", "--no-interactive"];
const RESTACK_ONLY_ARGS = ["restack", "--branch", "feature-b", "--only", "--no-interactive"];
const SUBMIT_FORCE_ARGS = [
	"submit",
	"--branch",
	"feature-b",
	"--no-stack",
	"--update-only",
	"--no-edit",
	"--no-ai",
	"--no-interactive",
	"--force",
];

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: ExitedResultFields | undefined;
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[]) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) return execResult({ code: 99, stderr: missingStepMessage });
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

function step(command: string, args: string[], result?: ExitedResultFields): ScriptedExec {
	return { command, args, result };
}

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function execResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createTestLandContext(pi: LandStackExtensionAPI) {
	return createLandContext(pi, { graphite: createLandGraphiteCommandChannel({ pi }) });
}

describe("land context adapter facts", () => {
	test("normalizes equivalent current-worktree paths at the adapter boundary", async () => {
		const pi = new FakePi([]);
		const context = createLandContext(pi, {
			graphite: createLandGraphiteCommandChannel({ pi }),
		});

		await expect(
			context.worktrees.classifyWorktree({ repoRoot: ".", path: resolve(".") }),
		).resolves.toEqual({ type: "success", value: { type: "current" } });
		pi.assertDone();
	});

	test("lists local branches with real tip SHAs", async () => {
		const pi = new FakePi([
			step("git", FOR_EACH_REF_ARGS, {
				stdout:
					"main\t1111111111111111111111111111111111111111\t2026-06-15T12:00:00+00:00\nfeature\t2222222222222222222222222222222222222222\t\n",
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(context.git.listLocalBranches({ repoRoot: ROOT })).resolves.toEqual({
			type: "success",
			value: [
				{ name: "main", sha: "1111111111111111111111111111111111111111" },
				{ name: "feature", sha: "2222222222222222222222222222222222222222" },
			],
		});
		pi.assertDone();
	});

	test("squash merges pull requests with the existing gh argv", async () => {
		const pi = new FakePi([
			step("gh", SQUASH_MERGE_ARGS, { stdout: "merged\n", stderr: "notice\n" }),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.github.squashMergePullRequest({
				repoRoot: ROOT,
				pullRequest: {
					id: "PR_node_42",
					number: 42,
					title: "Merge subject",
					body: "Merge body",
					state: "OPEN",
					isDraft: false,
					headRefName: "feature",
					baseRefName: "main",
					headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}),
		).resolves.toEqual({ type: "success", value: { stdout: "merged\n", stderr: "notice\n" } });
		expect(pi.execCalls).toEqual([
			{ command: "gh", args: SQUASH_MERGE_ARGS, options: { cwd: ROOT, timeout: 120000 } },
		]);
		pi.assertDone();
	});

	test("maps representative post-merge PR facts and load failure variants", async () => {
		const mergedFacts = {
			id: "PR_node_42",
			number: 42,
			title: "Merge subject",
			body: "Merge body",
			state: "MERGED",
			isDraft: false,
			headRefName: "feature",
			baseRefName: "main",
			headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			mergeStateStatus: "UNKNOWN",
			url: "https://github.example/pr/42",
			mergedAt: "2026-07-11T00:00:00Z",
		};
		const pi = new FakePi([
			step("gh", POST_MERGE_FACTS_ARGS, { stdout: `${JSON.stringify(mergedFacts)}\n` }),
			step("gh", POST_MERGE_FACTS_ARGS, { code: 1, stderr: "GitHub unavailable\n" }),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.github.pullRequestFacts({ repoRoot: ROOT, branchOrNumber: "42" }),
		).resolves.toEqual({ type: "success", value: mergedFacts });
		await expect(
			context.github.pullRequestFacts({ repoRoot: ROOT, branchOrNumber: "42" }),
		).resolves.toMatchObject({
			type: "failure",
			failure: {
				type: "boundary",
				source: "github",
				code: "github-gateway-failure",
				message: expect.stringContaining("GitHub unavailable"),
			},
		});
		expect(pi.execCalls).toEqual([
			{ command: "gh", args: POST_MERGE_FACTS_ARGS, options: { cwd: ROOT, timeout: 30000 } },
			{ command: "gh", args: POST_MERGE_FACTS_ARGS, options: { cwd: ROOT, timeout: 30000 } },
		]);
		pi.assertDone();
	});

	test("redacts squash merge body from failure diagnostics", async () => {
		const secretBody = "secret PR body";
		const pi = new FakePi([
			step("gh", [...SQUASH_MERGE_ARGS.slice(0, -1), secretBody], {
				code: 1,
				stderr: `rejected body: ${secretBody}\n`,
			}),
		]);
		const context = createTestLandContext(pi);

		const result = await context.github.squashMergePullRequest({
			repoRoot: ROOT,
			pullRequest: {
				id: "PR_node_42",
				number: 42,
				title: "Merge subject",
				body: secretBody,
				state: "OPEN",
				isDraft: false,
				headRefName: "feature",
				baseRefName: "main",
				headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
		});

		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.failure.type).toBe("boundary");
			if (result.failure.type === "boundary") {
				expect(result.failure.message).not.toContain(secretBody);
				expect(result.failure.message).toContain("--body '<PR body>'");
				expect(result.failure.displayCommand).toContain("--body '<PR body>'");
				expect(result.failure.execResult?.stderr).toBe("rejected body: <PR body>\n");
			}
		}
		pi.assertDone();
	});

	test("snapshots backup refs with the existing rotate-prune-write git argv", async () => {
		const oldRef = `${BACKUP_REF_NAMESPACE}/old`;
		const backupSnapshotFetchArgs = [
			"fetch",
			"--quiet",
			"--no-tags",
			".",
			`+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:${BACKUP_REF_NAMESPACE}/feature-a`,
			`+bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:${BACKUP_REF_NAMESPACE}/feature-b`,
		];
		const pi = new FakePi([
			step("git", BACKUP_ROTATION_ARGS),
			step("git", ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE], {
				stdout: `${oldRef}\n`,
			}),
			step("git", ["update-ref", "-d", oldRef]),
			step("git", FOR_EACH_REF_ARGS, {
				stdout: formatLiveBranchTips(["feature-a", "feature-b"], {
					shaOverrides: {
						"feature-a": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						"feature-b": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					},
				}),
			}),
			step("git", backupSnapshotFetchArgs),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.snapshotBackupRefs({
				repoRoot: ROOT,
				branches: ["feature-a", "feature-b"],
			}),
		).resolves.toEqual({
			type: "success",
			value: new Map([
				["feature-a", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
				["feature-b", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
			]),
		});
		expect(pi.execCalls).toEqual([
			{ command: "git", args: BACKUP_ROTATION_ARGS, options: { cwd: ROOT, timeout: 30000 } },
			{
				command: "git",
				args: ["for-each-ref", "--format=%(refname)", BACKUP_REF_NAMESPACE],
				options: { cwd: ROOT, timeout: 30000 },
			},
			{
				command: "git",
				args: ["update-ref", "-d", oldRef],
				options: { cwd: ROOT, timeout: 30000 },
			},
			{
				command: "git",
				args: FOR_EACH_REF_ARGS,
				options: { cwd: ROOT, timeout: 10000 },
			},
			{
				command: "git",
				args: backupSnapshotFetchArgs,
				options: { cwd: ROOT, timeout: 30000 },
			},
		]);
		pi.assertDone();
	});

	test("runs post-merge Graphite maintenance methods with the existing argv", async () => {
		const pi = new FakePi([
			step("gt", REFRESH_ARGS),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'feature-a' is already checked out at '/repo-slot'\n",
			}),
			step("gt", RESTACK_ARGS),
			step("gt", RESTACK_ONLY_ARGS),
			step("gt", SUBMIT_FORCE_ARGS),
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
				stdout: `${metadataDbJson([{ branch: "feature-a", children: ["feature-b"] }])}\n`,
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.graphite.refreshBranchFromRemote({
				repoRoot: ROOT,
				branch: "feature-b",
				checkedOutConflictHandling: "fail",
			}),
		).resolves.toMatchObject({ type: "success" });
		await expect(
			context.graphite.deleteLocalBranch({
				repoRoot: ROOT,
				branch: "feature-a",
				checkedOutConflictHandling: "retain",
			}),
		).resolves.toEqual({ type: "retained", branch: "feature-a", path: "/repo-slot" });
		await expect(
			context.graphite.restack({ repoRoot: ROOT, branch: "feature-b", scope: "upstack" }),
		).resolves.toMatchObject({ type: "success" });
		await expect(
			context.graphite.restack({ repoRoot: ROOT, branch: "feature-b", scope: "branch-only" }),
		).resolves.toMatchObject({ type: "success" });
		await expect(
			context.graphite.submitUpdate({ repoRoot: ROOT, branch: "feature-b", force: true }),
		).resolves.toMatchObject({ type: "success" });
		await expect(
			context.graphite.branchChildren({
				repoRoot: ROOT,
				metadataDbPath: DB_PATH,
				branch: "feature-a",
			}),
		).resolves.toEqual({ type: "success", value: ["feature-b"] });

		expect(pi.execCalls).toEqual([
			{
				command: "gt",
				args: REFRESH_ARGS,
				options: { cwd: ROOT, timeout: GT_MUTATION_TIMEOUT_MS },
			},
			{
				command: "gt",
				args: ["delete", "feature-a", "-f", "-q"],
				options: { cwd: ROOT, timeout: GT_MUTATION_TIMEOUT_MS },
			},
			{
				command: "gt",
				args: RESTACK_ARGS,
				options: { cwd: ROOT, timeout: GT_MUTATION_TIMEOUT_MS },
			},
			{
				command: "gt",
				args: RESTACK_ONLY_ARGS,
				options: { cwd: ROOT, timeout: GT_MUTATION_TIMEOUT_MS },
			},
			{
				command: "gt",
				args: SUBMIT_FORCE_ARGS,
				options: { cwd: ROOT, timeout: GT_MUTATION_TIMEOUT_MS },
			},
			{ command: TOPOLOGY_COMMAND, args: TOPOLOGY_ARGS, options: { cwd: ROOT, timeout: 30_000 } },
		]);
		pi.assertDone();
	});

	test("maps refresh failure and checkout-conflict protocol results", async () => {
		const pi = new FakePi([
			step("gt", REFRESH_ARGS, {
				code: 7,
				stdout: "partial refresh\n",
				stderr: "remote refresh rejected\n",
			}),
			step("gt", REFRESH_ARGS, {
				code: 1,
				stdout: "",
				stderr: "fatal: 'feature-b' is already checked out at '/repo-slot'\n",
			}),
		]);
		const context = createTestLandContext(pi);
		const request = {
			repoRoot: ROOT,
			branch: "feature-b",
			checkedOutConflictHandling: "defer" as const,
		};

		await expect(context.graphite.refreshBranchFromRemote(request)).resolves.toEqual({
			type: "failure",
			commandDisplay:
				"gt get feature-b --downstack --no-restack --no-checkout --force --no-interactive",
			result: execResult({
				code: 7,
				stdout: "partial refresh\n",
				stderr: "remote refresh rejected\n",
			}),
		});
		await expect(context.graphite.refreshBranchFromRemote(request)).resolves.toEqual({
			type: "checkout-conflict",
			branch: "feature-b",
			path: "/repo-slot",
			commandDisplay:
				"gt get feature-b --downstack --no-restack --no-checkout --force --no-interactive",
			result: execResult({
				code: 1,
				stderr: "fatal: 'feature-b' is already checked out at '/repo-slot'\n",
			}),
		});
		pi.assertDone();
	});

	test("maps Graphite mutation failures to typed command displays and results", async () => {
		const pi = new FakePi([
			step("gt", RESTACK_ARGS, {
				code: 8,
				stdout: "partial restack\n",
				stderr: "restack rejected\n",
			}),
			step("gt", SUBMIT_FORCE_ARGS, {
				code: 9,
				stdout: "partial submit\n",
				stderr: "submit rejected\n",
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.graphite.restack({ repoRoot: ROOT, branch: "feature-b", scope: "upstack" }),
		).resolves.toEqual({
			type: "failure",
			commandDisplay: "gt restack --branch feature-b --upstack --no-interactive",
			result: execResult({
				code: 8,
				stdout: "partial restack\n",
				stderr: "restack rejected\n",
			}),
		});
		await expect(
			context.graphite.submitUpdate({ repoRoot: ROOT, branch: "feature-b", force: true }),
		).resolves.toEqual({
			type: "failure",
			commandDisplay:
				"gt submit --branch feature-b --no-stack --update-only --no-edit --no-ai --no-interactive --force",
			result: execResult({
				code: 9,
				stdout: "partial submit\n",
				stderr: "submit rejected\n",
			}),
		});
		pi.assertDone();
	});

	test("classifies failed local-branch deletion protocol results for in-progress Git operations", async () => {
		const pi = new FakePi([
			step("gt", DELETE_ARGS, {
				code: 1,
				stdout: "CONFLICT (content): merge conflict in file.ts\n",
				stderr: "delete failed\n",
			}),
			step("gt", DELETE_ARGS, {
				code: 2,
				stdout: "",
				stderr: "branch deletion rejected\n",
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.graphite.deleteLocalBranch({
				repoRoot: ROOT,
				branch: "feature-a",
				checkedOutConflictHandling: "fail",
			}),
		).resolves.toMatchObject({
			type: "failed",
			result: {
				type: "exited",
				stdout: "CONFLICT (content): merge conflict in file.ts\n",
				stderr: "delete failed\n",
				code: 1,
			},
			isLikelyInProgressGitOperation: true,
		});
		await expect(
			context.graphite.deleteLocalBranch({
				repoRoot: ROOT,
				branch: "feature-a",
				checkedOutConflictHandling: "fail",
			}),
		).resolves.toMatchObject({
			type: "failed",
			result: {
				type: "exited",
				stdout: "",
				stderr: "branch deletion rejected\n",
				code: 2,
			},
			isLikelyInProgressGitOperation: false,
		});
		pi.assertDone();
	});

	test("maps slot-free success and failure protocol results", async () => {
		const slotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-02";
		const args = ["slot", "free", "--wt", "slot-02"];
		const pi = new FakePi([
			step("ns", args, { stdout: "freed slot-02\n", code: 0 }),
			step("ns", args, { stderr: "slot remains checked out\n", code: 3 }),
		]);
		const context = createTestLandContext(pi);
		const request = {
			repoRoot: ROOT,
			slots: [
				{
					type: "managed-slot" as const,
					branch: "feature-a",
					path: slotPath,
					slotName: "slot-02",
				},
			],
		};

		await expect(context.worktrees.freeSlots(request)).resolves.toEqual({
			type: "success",
			value: request.slots,
		});
		await expect(context.worktrees.freeSlots(request)).resolves.toMatchObject({
			type: "failure",
			failure: {
				type: "boundary",
				source: "slot",
				code: "slot_free_failed",
				displayCommand: "ns slot free --wt slot-02",
				execResult: {
					type: "exited",
					stderr: "slot remains checked out\n",
					code: 3,
				},
			},
		});
		pi.assertDone();
	});

	test("loads stack shape from supplied facts without recursively loading a landing shape", async () => {
		const pi = new FakePi([
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
				stdout: `${metadataDbJson([
					{ branch: "main", children: ["feature"], trunk: true },
					{ branch: "feature", parent: "main", children: [] },
				])}\n`,
			}),
		]);
		const context = createTestLandContext(pi);

		const result = await context.graphite.stackShape({
			repoRoot: ROOT,
			metadataDbPath: DB_PATH,
			current: "feature",
			trunk: "main",
			liveLocalBranches: ["main", "feature"],
		});

		expect(result).toMatchObject({
			type: "success",
			value: {
				landingBranches: ["feature"],
				descendantBranches: [],
			},
		});
		expect(pi.execCalls.map((call) => call.command)).toEqual([TOPOLOGY_COMMAND]);
		pi.assertDone();
	});
});
