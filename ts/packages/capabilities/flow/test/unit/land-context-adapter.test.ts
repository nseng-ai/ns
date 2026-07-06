import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/capability-kit/git";
import { retargetPullRequestBaseArgs } from "@nseng-ai/capability-kit/github/pr-mutations";
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
const BACKUP_ROTATION_ARGS = [
	"fetch",
	"--quiet",
	"--prune",
	"--no-tags",
	".",
	`+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`,
];
const GT_MUTATION_TIMEOUT_MS = 600_000;
const GIT_REMOTE_TIMEOUT_MS = 120_000;
const ADVANCE_MAIN_ARGS = [
	"fetch",
	"--quiet",
	"--no-tags",
	"origin",
	"refs/heads/main:refs/heads/main",
];
const REFRESH_ARGS = [
	"get",
	"feature-b",
	"--downstack",
	"--no-restack",
	"--no-checkout",
	"--force",
	"--no-interactive",
];
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
	result: Partial<ExecResult> | undefined;
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

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
		...(overrides.startupError === undefined ? {} : { startupError: overrides.startupError }),
	};
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createTestLandContext(pi: LandStackExtensionAPI) {
	return createLandContext(pi, { graphite: createLandGraphiteCommandChannel({ pi }) });
}

describe("land context adapter facts", () => {
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

	test("advances a branch from origin with a direct fast-forward fetch", async () => {
		const pi = new FakePi([step("git", ADVANCE_MAIN_ARGS)]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.advanceBranchFromRemote({ repoRoot: ROOT, branch: "main" }),
		).resolves.toEqual({ type: "advanced" });
		expect(pi.execCalls).toEqual([
			{
				command: "git",
				args: ADVANCE_MAIN_ARGS,
				options: { cwd: ROOT, timeout: GIT_REMOTE_TIMEOUT_MS },
			},
		]);
		pi.assertDone();
	});

	test("reports direct branch advance failures with command details", async () => {
		const pi = new FakePi([step("git", ADVANCE_MAIN_ARGS, { code: 1, stderr: "fetch failed\n" })]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.advanceBranchFromRemote({ repoRoot: ROOT, branch: "main" }),
		).resolves.toEqual({
			type: "failure",
			commandDisplay: formatCommand("git", ADVANCE_MAIN_ARGS),
			result: execResult({ code: 1, stderr: "fetch failed\n" }),
		});
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

	test("advances trunk from origin with a fast-forward-only fetch argv", async () => {
		const fetchArgs = [
			"fetch",
			"--quiet",
			"--no-tags",
			"origin",
			"refs/heads/main:refs/heads/main",
		];
		const pi = new FakePi([step("git", fetchArgs)]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.advanceBranchFromRemote({ repoRoot: ROOT, branch: "main" }),
		).resolves.toEqual({ type: "advanced" });
		expect(pi.execCalls).toEqual([
			{ command: "git", args: fetchArgs, options: { cwd: ROOT, timeout: 120_000 } },
		]);
		pi.assertDone();
	});

	test("maps a git fetch checked-out refusal to the checked-out result", async () => {
		const fetchArgs = [
			"fetch",
			"--quiet",
			"--no-tags",
			"origin",
			"refs/heads/main:refs/heads/main",
		];
		const pi = new FakePi([
			step("git", fetchArgs, {
				code: 1,
				stderr:
					"fatal: refusing to fetch into branch 'refs/heads/main' checked out at '/repo-main'\n",
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.advanceBranchFromRemote({ repoRoot: ROOT, branch: "main" }),
		).resolves.toEqual({
			type: "checked-out",
			branch: "refs/heads/main",
			path: "/repo-main",
		});
		pi.assertDone();
	});

	test("maps a non-fast-forward git fetch failure to the failure result", async () => {
		const fetchArgs = [
			"fetch",
			"--quiet",
			"--no-tags",
			"origin",
			"refs/heads/main:refs/heads/main",
		];
		const pi = new FakePi([
			step("git", fetchArgs, {
				code: 1,
				stderr: "fatal: Not possible to fast-forward, aborting.\n",
			}),
		]);
		const context = createTestLandContext(pi);

		const result = await context.git.advanceBranchFromRemote({ repoRoot: ROOT, branch: "main" });
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.commandDisplay).toBe(formatCommand("git", fetchArgs));
			expect(result.result.stderr).toContain("Not possible to fast-forward");
		}
		pi.assertDone();
	});

	test("pushes a branch with an explicit force-with-lease refspec and remote timeout", async () => {
		const expectedRemoteSha = "b".repeat(40);
		const pushArgs = [
			"push",
			"--quiet",
			`--force-with-lease=refs/heads/feature-b:${expectedRemoteSha}`,
			"origin",
			"refs/heads/feature-b:refs/heads/feature-b",
		];
		const pi = new FakePi([step("git", pushArgs)]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.pushBranchToRemoteWithLease({
				repoRoot: ROOT,
				branch: "feature-b",
				expectedRemoteSha,
			}),
		).resolves.toEqual({ type: "pushed" });
		expect(pi.execCalls).toEqual([
			{ command: "git", args: pushArgs, options: { cwd: ROOT, timeout: 120_000 } },
		]);
		pi.assertDone();
	});

	test("maps a stale-info push rejection to the lease-rejected result", async () => {
		const expectedRemoteSha = "b".repeat(40);
		const pushArgs = [
			"push",
			"--quiet",
			`--force-with-lease=refs/heads/feature-b:${expectedRemoteSha}`,
			"origin",
			"refs/heads/feature-b:refs/heads/feature-b",
		];
		const pi = new FakePi([
			step("git", pushArgs, {
				code: 1,
				stderr:
					" ! [rejected]        feature-b -> feature-b (stale info)\nerror: failed to push some refs to 'origin'\n",
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.git.pushBranchToRemoteWithLease({
				repoRoot: ROOT,
				branch: "feature-b",
				expectedRemoteSha,
			}),
		).resolves.toEqual({ type: "lease-rejected" });
		pi.assertDone();
	});

	test("maps a non-lease push failure to the failure result", async () => {
		const expectedRemoteSha = "b".repeat(40);
		const pushArgs = [
			"push",
			"--quiet",
			`--force-with-lease=refs/heads/feature-b:${expectedRemoteSha}`,
			"origin",
			"refs/heads/feature-b:refs/heads/feature-b",
		];
		const pi = new FakePi([
			step("git", pushArgs, { code: 1, stderr: "fatal: unable to access 'origin'\n" }),
		]);
		const context = createTestLandContext(pi);

		const result = await context.git.pushBranchToRemoteWithLease({
			repoRoot: ROOT,
			branch: "feature-b",
			expectedRemoteSha,
		});
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.commandDisplay).toBe(formatCommand("git", pushArgs));
			expect(result.result.stderr).toContain("unable to access");
		}
		pi.assertDone();
	});

	test("retargets a pull request base with the gh api graphql mutation argv", async () => {
		const retargetArgs = retargetPullRequestBaseArgs({
			pullRequestId: "PR_node_42",
			baseRefName: "main",
		});
		const pi = new FakePi([
			step("gh", retargetArgs, {
				stdout: `${JSON.stringify({
					data: {
						updatePullRequest: {
							pullRequest: { id: "PR_node_42", number: 42, baseRefName: "main" },
						},
					},
				})}\n`,
			}),
		]);
		const context = createTestLandContext(pi);

		await expect(
			context.github.retargetPullRequestBase({
				repoRoot: ROOT,
				pullRequest: {
					id: "PR_node_42",
					number: 42,
					title: "Feature",
					body: null,
					state: "OPEN",
					isDraft: false,
					headRefName: "feature",
					baseRefName: "feature-a",
					headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
				baseRefName: "main",
			}),
		).resolves.toEqual({ type: "retargeted" });
		expect(pi.execCalls).toEqual([
			{ command: "gh", args: retargetArgs, options: { cwd: ROOT, timeout: 30_000 } },
		]);
		pi.assertDone();
	});

	test("maps a graphql-error retarget response to the failure result", async () => {
		const retargetArgs = retargetPullRequestBaseArgs({
			pullRequestId: "PR_node_42",
			baseRefName: "main",
		});
		const pi = new FakePi([
			step("gh", retargetArgs, {
				stdout: `${JSON.stringify({
					data: { updatePullRequest: null },
					errors: [{ message: "Could not resolve to a node." }],
				})}\n`,
			}),
		]);
		const context = createTestLandContext(pi);

		const result = await context.github.retargetPullRequestBase({
			repoRoot: ROOT,
			pullRequest: {
				id: "PR_node_42",
				number: 42,
				title: "Feature",
				body: null,
				state: "OPEN",
				isDraft: false,
				headRefName: "feature",
				baseRefName: "feature-a",
				headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
			baseRefName: "main",
		});
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.message).toContain("Could not resolve to a node.");
			expect(result.commandDisplay).toBe(formatCommand("gh", retargetArgs));
		}
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
