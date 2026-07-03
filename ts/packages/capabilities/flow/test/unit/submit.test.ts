import { describe, expect, test } from "vitest";

import {
	parseCommitMessages,
	parseGtLogStack,
	parseParentBranch,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type GithubPrGateway,
	type SubmitGateway,
	type SubmitMetadataGateway,
	type TextGenerator,
} from "../../src/submit/index.ts";
import { RealSubmitGateway } from "../../src/submit/index.ts";
import type { GitGateway } from "@sdl/capability-kit/git";
import { ScriptedCommandRunner, startupErrorStep, step } from "@sdl/core/exec/testing";

describe("RealSubmitGateway", () => {
	test("checkSubmitReadiness invokes Graphite dry-run submit", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{ stdout: "ok\n" },
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		expect(await gateway.checkSubmitReadiness({ cwd: "/repo" })).toMatchObject({ kind: "ready" });
		expect(runner.calls).toEqual([
			{
				command: "gt",
				args: [
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				cwd: "/repo",
			},
		]);
		runner.assertDone();
	});

	test("forced readiness checks pass --force before --dry-run", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--force",
					"--dry-run",
				],
				{ stdout: "ok\n" },
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		expect(await gateway.checkSubmitReadiness({ cwd: "/repo", force: true })).toMatchObject({
			kind: "ready",
		});
		runner.assertDone();
	});

	test("Graphite command output is streamed to the optional listener", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{ stdout: "dry-run stdout\n", stderr: "dry-run stderr\n" },
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);
		const outputEvents: Array<{ stream: string; text: string }> = [];

		await gateway.checkSubmitReadiness({
			cwd: "/repo",
			onOutput: (stream, text) => {
				outputEvents.push({ stream, text });
			},
		});

		expect(outputEvents).toEqual([
			{ stream: "stdout", text: "dry-run stdout\n" },
			{ stream: "stderr", text: "dry-run stderr\n" },
		]);
		runner.assertDone();
	});

	test("checkSubmitReadiness maps restack-required dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{ exitCode: 1, stderr: "This stack must be restacked before submitting.\n" },
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result.kind).toBe("restack_required");
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies trunk-out-of-date dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{
					exitCode: 1,
					stderr:
						"ERROR: Aborting submit because trunk branch is out of date and could not be updated.\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: { kind: "trunk_out_of_date" } });
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies remotely updated branch dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{
					exitCode: 1,
					stderr:
						"ERROR: Branch add-preflight-detect-and-skip-empty-branches has been updated remotely outside of Graphite. Use gt get or gt sync to sync with remote before submitting (or use the --force flag to override this check).\n",
				},
			),
			step("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
				stdout: "origin/add-preflight-detect-and-skip-empty-branches\n",
			}),
			step(
				"git",
				[
					"rev-list",
					"--left-right",
					"--count",
					"HEAD...origin/add-preflight-detect-and-skip-empty-branches",
				],
				{ stdout: "35\t1\n" },
			),
			step(
				"git",
				[
					"log",
					"--format=%h %s",
					"--max-count=3",
					"origin/add-preflight-detect-and-skip-empty-branches",
					"--not",
					"HEAD",
				],
				{ stdout: "abc123 remote checkpoint\n" },
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: {
				kind: "remote_updated_outside_graphite",
				branchName: "add-preflight-detect-and-skip-empty-branches",
				remoteSync: {
					upstream: "origin/add-preflight-detect-and-skip-empty-branches",
					aheadCount: 35,
					behindCount: 1,
					remoteOnlyCommits: ["abc123 remote checkpoint"],
				},
			},
		});
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies empty-branch dry-run warnings", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{
					stdout: `Running submit in 'dry-run' mode.
🥞 Validating that this Graphite stack is ready to submit...
▸ code-smell/tools-vibechk-exec-artifact-bounds
`,
					stderr: `WARNING: This branch does not introduce any changes:
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
`,
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: {
				kind: "empty_branch_skipped",
				branchName: "code-smell/tools-vibechk-exec-artifact-bounds",
			},
		});
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies empty branch when dry-run also reports no-op PRs", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{
					stdout: `Running submit in 'dry-run' mode.
🥞 Validating that this Graphite stack is ready to submit...
WARNING: This branch does not introduce any changes:
▸ empty-branch-test
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
WARNING: In order to submit, commit some changes to it or delete it and try again.

📝 Preparing to submit PRs for the following branches...
▸ add-preflight-detect-and-skip-empty-branches (No-op)

🆗 All PRs up to date.
`,
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: {
				kind: "empty_branch_skipped",
				branchName: "empty-branch-test",
			},
		});
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies merged PR not contained in trunk dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--dry-run",
				],
				{
					exitCode: 1,
					stdout: "▸ handoff-capability/stack-feedback-remediation - PR #2257 (merged)\n",
					stderr:
						"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nERROR: Aborting dry run.\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: { kind: "merged_pr_not_in_trunk" },
		});
		runner.assertDone();
	});

	test("restackCurrentStack reports conflicts from git conflict facts", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["restack", "--downstack", "--no-interactive"], {
				exitCode: 1,
				stderr: "CONFLICT (content): merge conflict\n",
			}),
			step("git", ["diff", "--name-only", "--diff-filter=U"], { stdout: "src/app.ts\n" }),
			step("git", ["status", "--porcelain"], { stdout: "UU src/app.ts\n" }),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.restackCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "conflict", conflictedFiles: ["src/app.ts"] });
		expect(runner.calls.map((call) => call.command)).toEqual(["gt", "git", "git"]);
		runner.assertDone();
	});

	test("submitCurrentStack extracts PR links from submit output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
				],
				{
					stdout: "Created https://github.com/acme/project/pull/456\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }],
		});
		runner.assertDone();
	});

	test("submitCurrentStack classifies merged PR not contained in trunk submit output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
				],
				{
					exitCode: 1,
					stdout: "▸ shared-import-scanner-test-helpers - PR #2289 (merged)\n",
					stderr:
						"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nERROR: Aborting submit.\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: { kind: "merged_pr_not_in_trunk" },
		});
		runner.assertDone();
	});

	test("forced submit passes --force to Graphite", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
					"--force",
				],
				{
					stdout: "Created https://github.com/acme/project/pull/456\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo", force: true });

		expect(result).toMatchObject({ kind: "success" });
		runner.assertDone();
	});

	test("submitCurrentStack preserves semantic empty-branch failure from zero-exit output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
				],
				{
					stdout:
						"This branch does not introduce any changes:\nGraphite will not be submitted because GitHub does not allow empty PRs.\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			semanticFailureCause: { kind: "empty_branch_skipped" },
		});
		runner.assertDone();
	});

	test("submitCurrentStack extracts the empty branch from Graphite validation output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				[
					"submit",
					"--no-edit",
					"--publish",
					"--no-stack",
					"--no-ai",
					"--no-interactive",
					"--no-view",
					"--no-web",
				],
				{
					stdout: `🥞 Validating that this Graphite stack is ready to submit...
▸ sdl-extension-api-followup-stack

📝 Preparing to submit PRs for the following branches...
▸ add-sdl-extension-api (No-op)
`,
					stderr: `WARNING: This branch does not introduce any changes:
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
`,
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			semanticFailureCause: {
				kind: "empty_branch_skipped",
				branchName: "sdl-extension-api-followup-stack",
			},
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps branch info without a PR link", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["branch", "info", "--no-interactive"], {
				stdout: "feature/demo\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "no_current_pr", cause: "no_current_pr" });
		runner.assertDone();
	});

	test("verifyCurrentPr reads PR links from branch info without opening the PR page", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["branch", "info", "--no-interactive"], {
				stdout:
					"feature/demo\n\nPR #456 (Open) Demo PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "present",
			prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }],
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps startup errors", async () => {
		const runner = new ScriptedCommandRunner([
			startupErrorStep("gt", ["branch", "info", "--no-interactive"], "spawn gt ENOENT"),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: "startup_error",
			output: { startupError: "spawn gt ENOENT" },
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps timeouts", async () => {
		const runner = new ScriptedCommandRunner([
			{
				command: "gt",
				args: ["branch", "info", "--no-interactive"],
				exitCode: 124,
				isKilled: true,
			},
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "timeout" });
		runner.assertDone();
	});

	test("verifyCurrentPr maps generic command failures", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["branch", "info", "--no-interactive"], {
				exitCode: 2,
				stderr: "Graphite failed\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "command_failed" });
		runner.assertDone();
	});
});

describe("runSubmitCommand", () => {
	test("formats gateway-domain preflight failures without Graphite stderr fixtures", async () => {
		const gateway: SubmitGateway = {
			checkSubmitReadiness: async () => ({
				kind: "failed",
				cause: { kind: "trunk_out_of_date" },
				output: { stdout: "", stderr: "", exitCode: 1 },
			}),
			restackCurrentStack: async () => unexpectedCall("restackCurrentStack"),
			submitCurrentStack: async () => unexpectedCall("submitCurrentStack"),
			verifyCurrentPr: async () => unexpectedCall("verifyCurrentPr"),
		};

		const result = await runSubmitCommand({
			cwd: "/repo",
			gateway,
			metadataGateway: unusedSubmitMetadataGateway,
			restack: false,
			force: false,
			prDescription: {
				githubPr: unusedGithubPrGateway,
				textGenerator: unusedTextGenerator,
				git: unusedGitGateway,
				env: {},
			},
		});

		expect(result).toMatchObject({
			exitCode: 1,
			stdout: "",
			failurePresentation: "deterministic",
		});
		expect(result.stderr).toBe(
			[
				"Graphite could not update your local trunk before submitting. Nothing was submitted.",
				"",
				"Fix: update or repair your local trunk checkout (resolve any specific trunk problem Graphite reported), then rerun `ji flow submit`.",
				"",
			].join("\n"),
		);
	});
});

const unusedSubmitMetadataGateway: SubmitMetadataGateway = {
	inspectSubmitStack: async () => unexpectedCall("inspectSubmitStack"),
	ensureCleanWorktree: async () => unexpectedCall("ensureCleanWorktree"),
	amendBranchMetadataCommit: async () => unexpectedCall("amendBranchMetadataCommit"),
};

const unusedGithubPrGateway: GithubPrGateway = {
	viewCurrentBranchPr: async () => unexpectedCall("viewCurrentBranchPr"),
	viewPr: async () => unexpectedCall("viewPr"),
	getPrCommitMessages: async () => unexpectedCall("getPrCommitMessages"),
	getPrDiff: async () => unexpectedCall("getPrDiff"),
	stablePatchIdForPr: async () => unexpectedCall("stablePatchIdForPr"),
	editPr: async () => unexpectedCall("editPr"),
};

const unusedTextGenerator: TextGenerator = {
	generateText: async () => unexpectedCall("generateText"),
};

const unusedGitGateway: GitGateway = {
	repoRoot: async () => unexpectedCall("repoRoot"),
	optionalRepoRoot: async () => unexpectedCall("optionalRepoRoot"),
	currentBranch: async () => unexpectedCall("currentBranch"),
	isInsideWorkTree: async () => unexpectedCall("isInsideWorkTree"),
	trunkBranch: async () => unexpectedCall("trunkBranch"),
	originUrl: async () => unexpectedCall("originUrl"),
	headCommit: async () => unexpectedCall("headCommit"),
	gitPath: async () => unexpectedCall("gitPath"),
	validateBranchRef: async () => unexpectedCall("validateBranchRef"),
	localBranchPresence: async () => unexpectedCall("localBranchPresence"),
	createBranchAtHead: async () => unexpectedCall("createBranchAtHead"),
	hasUncommittedChangesUnder: async () => unexpectedCall("hasUncommittedChangesUnder"),
	listLocalBranchTips: async () => unexpectedCall("listLocalBranchTips"),
	treeOidsAtRefs: async () => unexpectedCall("treeOidsAtRefs"),
	changedPathsUnder: async () => unexpectedCall("changedPathsUnder"),
	statusPaths: async () => unexpectedCall("statusPaths"),
	stagePaths: async () => unexpectedCall("stagePaths"),
	commit: async () => unexpectedCall("commit"),
};

function unexpectedCall(name: string): never {
	throw new Error(`Unexpected test call: ${name}`);
}

describe("RealSubmitMetadataGateway", () => {
	test("parses Graphite stack and branch metadata facts", () => {
		const log = `◯ parent-branch
│
◉ feature/demo (current)
│
◯ master
`;

		expect(parseGtLogStack(log)).toEqual({
			branches: ["parent-branch", "feature/demo", "master"],
			currentBranch: "feature/demo",
		});
		expect(parseParentBranch("feature/demo\n\nParent: parent-branch\n")).toBe("parent-branch");
		expect(parseCommitMessages("Add widget\n\nImplement widget.\0Fix tests\0")).toEqual([
			{ headline: "Add widget", body: "Implement widget." },
			{ headline: "Fix tests" },
		]);
	});

	test("inspectSubmitStack skips local diff reads for existing PR branches", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], {
				stdout: "◯ master\n│\n◉ feature/demo (current)\n",
			}),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], {
				stdout:
					"feature/demo\n\nPR #456 (Open) Demo PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				branches: [
					{
						kind: "existing",
						branch: "feature/demo",
						parentBranch: "master",
						pr: { label: "#456", url: "https://github.com/acme/project/pull/456" },
					},
				],
			},
		});
		runner.assertDone();
	});

	test("inspectSubmitStack fails when branch info reports a PR without a link", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], {
				stdout: "◯ master\n│\n◉ feature/demo (current)\n",
			}),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], {
				stdout: "feature/demo\n\nPR #456 (Open) Demo PR\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({ ok: false, error: { code: "submit_existing_pr_link_missing" } });
		runner.assertDone();
	});

	test("inspectSubmitStack reads local diffs and commits for new submit branches", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], {
				stdout: "◯ master\n│\n◯ feature/demo (current)\n",
			}),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], {
				stdout: "feature/demo\n\nParent: master\n",
			}),
			step("git", ["log", "--format=%B%x00", "master..feature/demo"], {
				stdout: "Add widget\n\nImplement widget.\0",
			}),
			step("git", ["diff", "master..feature/demo"], {
				stdout: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/demo",
				branches: [
					{
						kind: "new",
						branch: "feature/demo",
						parentBranch: "master",
						commitMessages: [{ headline: "Add widget", body: "Implement widget." }],
						diff: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n",
					},
				],
			},
		});
		runner.assertDone();
	});

	test("inspectSubmitStack ignores upstack descendants when reading branch metadata", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], {
				stdout:
					"◯ master\n│\n◯ downstack/base\n│\n◉ feature/current (current)\n│\n◯ feature/upstack\n",
			}),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/current"], {
				stdout:
					"feature/current\n\nPR #789 (Open) Current PR\nhttps://github.com/acme/project/pull/789\n\nParent: downstack/base\n",
			}),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "downstack/base"], {
				stdout:
					"downstack/base\n\nPR #456 (Open) Base PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: {
				currentBranch: "feature/current",
				branches: [
					{
						kind: "existing",
						branch: "downstack/base",
						parentBranch: "master",
						pr: { label: "#456", url: "https://github.com/acme/project/pull/456" },
					},
					{
						kind: "existing",
						branch: "feature/current",
						parentBranch: "downstack/base",
						pr: { label: "#789", url: "https://github.com/acme/project/pull/789" },
					},
				],
			},
		});
		expect(runner.calls.map((call) => call.args.join(" "))).not.toContain(
			"branch info --no-interactive --branch feature/upstack",
		);
		runner.assertDone();
	});

	test("inspectSubmitStack fails on branch parent cycles", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], {
				stdout: "◯ master\n│\n◯ feature/base\n│\n◉ feature/current (current)\n",
			}),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/current"], {
				stdout: "feature/current\n\nParent: feature/base\n",
			}),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/base"], {
				stdout: "feature/base\n\nParent: feature/current\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({ ok: false, error: { code: "submit_branch_parent_cycle" } });
		runner.assertDone();
	});

	test("amendBranchMetadataCommit uses Graphite modify without generated markers", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["modify", "--no-interactive", "-m", "Generated title", "-m", "Generated body"], {
				stdout: "Modified\n",
			}),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		expect(
			await gateway.amendBranchMetadataCommit({
				cwd: "/repo",
				currentBranch: "feature/demo",
				branch: "feature/demo",
				title: "Generated title",
				body: "Generated body",
			}),
		).toEqual({ ok: true, value: undefined });
		runner.assertDone();
	});
});
