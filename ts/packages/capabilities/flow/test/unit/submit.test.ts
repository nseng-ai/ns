import { describe, expect, test } from "vitest";

import type { ActiveOperation, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import {
	ok,
	runSubmitCommand,
	type GithubPrGateway,
	type SubmitGateway,
	type SubmitMatrixProgressSink,
	type SubmitMetadataGateway,
	type SubmitProgress,
	type TextGenerator,
} from "../../src/submit/index.ts";
import { RealSubmitGateway } from "../../src/submit/index.ts";
import { formatBatchPosition, formatSubmitSuccessText } from "../../src/submit/submit-format.ts";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	ScriptedCommandRunner,
	exitedResult,
	spawnFailedResult,
} from "@nseng-ai/foundation/exec/testing";
import { ScriptedTextGenerator } from "@nseng-ai/capability-kit/text-generation/testing";

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	exitCode?: number | null;
	code?: number | null;
	signal?: string | null;
}

function execStep(command: string, args: readonly string[], fields: ExitedResultFields = {}) {
	const { exitCode, ...closeFields } = fields;
	return {
		command,
		args: [...args],
		result: exitedResult({ ...closeFields, code: closeFields.code ?? exitCode ?? 0 }),
	};
}

function spawnFailedStep(command: string, args: readonly string[], error: string) {
	return { command, args: [...args], result: spawnFailedResult(error) };
}

describe("formatBatchPosition", () => {
	test("formats a zero-based batch index for display", () => {
		expect(formatBatchPosition({ noun: "PR", index: 1, total: 3 })).toBe("PR 2/3");
	});
});

describe("formatSubmitSuccessText", () => {
	test("omits the description preview line when no first line is available", () => {
		const link = { label: "#123", url: "https://github.com/acme/repo/pull/123" };

		const output = formatSubmitSuccessText([link], {
			generated: [link],
			skipped: [],
			prewritten: [],
			prewriteFallbacks: [],
			previews: [{ link, title: "Generated title", descriptionFirstLine: undefined }],
		});

		expect(output).toContain("new title: Generated title");
		expect(output).not.toContain("new description:");
	});
});

describe("RealSubmitGateway", () => {
	test("checkSubmitReadiness invokes Graphite dry-run submit", async () => {
		const runner = new ScriptedCommandRunner([
			execStep(
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
			execStep(
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
			execStep(
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
			execStep(
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
			execStep(
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
			execStep(
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
			execStep("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
				stdout: "origin/add-preflight-detect-and-skip-empty-branches\n",
			}),
			execStep(
				"git",
				[
					"rev-list",
					"--left-right",
					"--count",
					"HEAD...origin/add-preflight-detect-and-skip-empty-branches",
				],
				{ stdout: "35\t1\n" },
			),
			execStep(
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
			execStep(
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
			execStep(
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
			execStep(
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
			execStep("gt", ["restack", "--downstack", "--no-interactive"], {
				exitCode: 1,
				stderr: "CONFLICT (content): merge conflict\n",
			}),
			execStep("git", ["diff", "--name-only", "--diff-filter=U"], { stdout: "src/app.ts\n" }),
			execStep("git", ["status", "--porcelain"], { stdout: "UU src/app.ts\n" }),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.restackCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "conflict", conflictedFiles: ["src/app.ts"] });
		expect(runner.calls.map((call) => call.command)).toEqual(["gt", "git", "git"]);
		runner.assertDone();
	});

	test("submitCurrentStack extracts PR links from submit output", async () => {
		const runner = new ScriptedCommandRunner([
			execStep(
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

	test("submitCurrentStack classifies Graphite PR-info lookup submit failure", async () => {
		const runner = new ScriptedCommandRunner([
			execStep(
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
					stdout:
						"Running in non-interactive mode. Inline prompts to fill PR fields will be skipped.\n\n🥞 Validating that this Graphite stack is ready to submit...\n",
					stderr: "ERROR: Failed to get pull request info. Please try again.\n",
				},
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: { kind: "graphite_pr_info_lookup_failed" },
		});
		runner.assertDone();
	});

	test("submitCurrentStack classifies merged PR not contained in trunk submit output", async () => {
		const runner = new ScriptedCommandRunner([
			execStep(
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
			execStep(
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
			execStep(
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
			execStep(
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

	test("verifyCurrentPr maps GitHub's no-current-PR failure", async () => {
		const runner = new ScriptedCommandRunner([
			execStep("gh", ["pr", "view", "--json", "number,url"], {
				exitCode: 1,
				stderr: 'no pull requests found for branch "feature/demo"\n',
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "no_current_pr", cause: "no_current_pr" });
		runner.assertDone();
	});

	test("verifyCurrentPr reads identity from structured GitHub JSON", async () => {
		const runner = new ScriptedCommandRunner([
			execStep("gh", ["pr", "view", "--json", "number,url"], {
				stdout: JSON.stringify({
					number: 456,
					url: "https://github.com/acme/project/pull/456",
				}),
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "present",
			prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }],
			output: { stdout: '{"number":456,"url":"https://github.com/acme/project/pull/456"}' },
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps startup errors", async () => {
		const runner = new ScriptedCommandRunner([
			spawnFailedStep("gh", ["pr", "view", "--json", "number,url"], "spawn gh ENOENT"),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: "startup_error",
			output: {
				type: "spawn-failed",
				stdout: "",
				stderr: "spawn gh ENOENT",
				error: "spawn gh ENOENT",
			},
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps timeouts", async () => {
		const runner = new ScriptedCommandRunner([
			{
				command: "gh",
				args: ["pr", "view", "--json", "number,url"],
				result: {
					type: "timed-out",
					stdout: "",
					stderr: "",
					code: 124,
					signal: "SIGTERM",
				},
			},
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "timeout" });
		runner.assertDone();
	});

	test("verifyCurrentPr maps malformed success JSON honestly", async () => {
		const runner = new ScriptedCommandRunner([
			execStep("gh", ["pr", "view", "--json", "number,url"], {
				stdout: '{"number":"456","url":null}',
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "failed",
			cause: "malformed_output",
			output: { stdout: '{"number":"456","url":null}' },
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps generic command failures", async () => {
		const runner = new ScriptedCommandRunner([
			execStep("gh", ["pr", "view", "--json", "number,url"], {
				exitCode: 2,
				stderr: "GitHub failed\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "command_failed" });
		runner.assertDone();
	});
});

describe("runSubmitCommand", () => {
	test("records submit and verify as global matrix rows and descriptions by PR", async () => {
		const linkA = { label: "#123", url: "https://github.com/acme/repo/pull/123" };
		const linkB = { label: "#456", url: "https://github.com/acme/repo/pull/456" };
		const submitMatrix = new RecordingSubmitMatrix();
		const gateway: SubmitGateway = {
			checkSubmitReadiness: async () => ({
				kind: "ready",
				output: exitedResult({ stdout: "ready", stderr: "", code: 0 }),
			}),
			restackCurrentStack: async () => unexpectedCall("restackCurrentStack"),
			submitCurrentStack: async () => ({
				kind: "success",
				output: exitedResult({ stdout: "submitted", stderr: "", code: 0 }),
				prLinks: [linkA, linkB],
			}),
			updateStackPrs: async () => unexpectedCall("updateStackPrs"),
			verifyCurrentPr: async () => ({
				kind: "present",
				output: exitedResult({ stdout: "current", stderr: "", code: 0 }),
				prLinks: [linkB],
			}),
		};
		const metadataGateway: SubmitMetadataGateway = {
			inspectSubmitStackTopology: async () => unexpectedCall("inspectSubmitStackTopology"),
			inspectSubmitStack: async () => ({
				ok: true,
				value: {
					currentBranch: "feature/b",
					hasUpstackBranches: false,
					branches: [
						{ kind: "existing", branch: "feature/a", parentBranch: "main", pr: linkA },
						{
							kind: "new",
							branch: "feature/b",
							parentBranch: "feature/a",
							commitMessages: [{ headline: "Add b" }, { headline: "Refine b" }],
							diff: "diff --git a/b b/b\n+b",
						},
					],
				},
			}),
			ensureCleanWorktree: async () => unexpectedCall("ensureCleanWorktree"),
			amendBranchMetadataCommit: async () => unexpectedCall("amendBranchMetadataCommit"),
		};
		const githubPr = new SubmitDescriptionGithubPrGateway();
		const textGenerator = new ScriptedTextGenerator([
			{ ok: true, text: "Title A\n\nBody A" },
			{ ok: true, text: "Title B\n\nBody B" },
		]);

		const result = await runSubmitCommand({
			cwd: "/repo",
			gateway,
			metadataGateway,
			restack: true,
			force: false,
			shouldRegenerateExistingPrDescriptions: true,
			prDescription: {
				githubPr,
				textGenerator,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				descriptorSource: flowExtensionDescriptorSource,
				modelRef: "openai-codex/gpt-5.6-luna",
				env: {},
			},
			progress: testSubmitProgress(submitMatrix),
		});

		expect(result.exitCode).toBe(0);
		expect(
			submitMatrix.phaseEvents.filter(
				(event) => "phaseKey" in event && event.phaseKey === "submit",
			),
		).toEqual([
			{
				type: "phase-started",
				phaseKey: "submit",
				label:
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			},
			{ type: "phase-done", phaseKey: "submit", detail: "stack submitted" },
		]);
		expect(
			submitMatrix.phaseEvents.filter(
				(event) => "phaseKey" in event && event.phaseKey === "verification",
			),
		).toEqual([
			{ type: "phase-started", phaseKey: "verification", label: "checking current PR" },
			{ type: "phase-done", phaseKey: "verification", detail: "current PR verified (#456)" },
		]);
		expect(submitMatrix.prCellEvents).toEqual([
			{ prNumber: 123, column: "description", state: "active", text: "loading PR metadata" },
			{ prNumber: 123, column: "description", state: "done", text: "generated" },
			{ prNumber: 456, column: "description", state: "active", text: "loading PR metadata" },
			{ prNumber: 456, column: "description", state: "done", text: "generated" },
		]);
		// The metadata phase reports only work that is actually pending: never the former broad
		// six-command snapshot, only true single operations (detailed ordering is covered at the
		// prepareSubmitPrMetadata and generateSubmitPrDescriptions seams).
		expect(submitMatrix.operationSnapshots.every((snapshot) => snapshot.length <= 1)).toBe(true);
		expect(
			submitMatrix.operationSnapshots.some((snapshot) =>
				snapshot.some(
					(operation) =>
						operation.kind === "command" &&
						operation.display === "gt log --stack --reverse --no-interactive",
				),
			),
		).toBe(false);
		expect(submitMatrix.operationSnapshots).toContainEqual([
			{ kind: "command", display: "gh pr view --json number,url" },
		]);
		expect(submitMatrix.operationSnapshots).toContainEqual([
			{
				kind: "model",
				operation: "generating PR description",
				modelRef: "openai-codex/gpt-5.6-luna",
				detail: "PR 1/2",
			},
		]);
		textGenerator.assertDone();
	});

	test("formats gateway-domain preflight failures without Graphite stderr fixtures", async () => {
		const gateway: SubmitGateway = {
			checkSubmitReadiness: async () => ({
				kind: "failed",
				cause: { kind: "trunk_out_of_date" },
				output: exitedResult({ stdout: "", stderr: "", code: 1 }),
			}),
			restackCurrentStack: async () => unexpectedCall("restackCurrentStack"),
			submitCurrentStack: async () => unexpectedCall("submitCurrentStack"),
			updateStackPrs: async () => unexpectedCall("updateStackPrs"),
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
				descriptorSource: flowExtensionDescriptorSource,
				modelRef: "openai-codex/gpt-5.6-luna",
				env: {},
			},
			progress: testSubmitProgress(),
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
				"Likely cause: your local trunk checkout has diverged from its remote (for example, local-only commits or an in-progress operation on trunk), so Graphite could not fast-forward it.",
				"Fix: run `gt sync` to update trunk (move any local-only trunk commits onto a feature branch first), then rerun `ns flow submit`.",
				"",
			].join("\n"),
		);
	});
});

function testSubmitProgress(matrix?: SubmitMatrixProgressSink): SubmitProgress {
	return { phase: (event) => matrix?.phase(event), matrix };
}

interface SubmitMatrixPrCellEvent {
	prNumber: number;
	column: Parameters<SubmitMatrixProgressSink["setCellByPrNumber"]>[1];
	state: Parameters<SubmitMatrixProgressSink["setCellByPrNumber"]>[2]["state"];
	text?: string;
}

class RecordingSubmitMatrix implements SubmitMatrixProgressSink {
	readonly phaseEvents: NsProgressPhaseEvent[] = [];
	readonly prCellEvents: SubmitMatrixPrCellEvent[] = [];
	readonly operationSnapshots: ActiveOperation[][] = [];

	setRows(): void {}

	setActiveOperations(operations: readonly ActiveOperation[]): void {
		this.operationSnapshots.push([...operations]);
	}

	phase(event: NsProgressPhaseEvent): void {
		this.phaseEvents.push(event);
	}

	setCell(): void {}

	setCellByPrNumber(
		prNumber: number,
		column: Parameters<SubmitMatrixProgressSink["setCellByPrNumber"]>[1],
		update: Parameters<SubmitMatrixProgressSink["setCellByPrNumber"]>[2],
	): void {
		this.prCellEvents.push({ prNumber, column, state: update.state, ...optionalText(update.text) });
	}

	setAllCells(): void {}

	setPendingCells(): void {}

	applyPrLinks(): void {}
}

class SubmitDescriptionGithubPrGateway implements GithubPrGateway {
	async viewCurrentBranchPr(): Promise<never> {
		return unexpectedCall("viewCurrentBranchPr");
	}

	async viewPr(params: { number: number }) {
		return {
			ok: true,
			value: {
				number: params.number,
				url: `https://github.com/acme/repo/pull/${params.number}`,
				title: `Current title ${params.number}`,
				body: `Current body ${params.number}`,
				headRefName: params.number === 123 ? "feature/a" : "feature/b",
				baseRefName: params.number === 123 ? "main" : "feature/a",
			},
		} as const;
	}

	async getPrCommitMessages() {
		return ok([{ headline: "Add feature" }]);
	}

	async getPrDiff() {
		return ok("diff --git a/file b/file\n+change");
	}

	async stablePatchIdForPr() {
		return ok({ patchId: "patch-id", diff: "diff --git a/file b/file\n+change" });
	}

	async editPr() {
		return ok(undefined);
	}
}

function optionalText(text: string | undefined): { text?: string } {
	return text === undefined ? {} : { text };
}

const unusedSubmitMetadataGateway: SubmitMetadataGateway = {
	inspectSubmitStackTopology: async () => unexpectedCall("inspectSubmitStackTopology"),
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

const unusedGitGateway = new InMemoryGitGateway();

function unexpectedCall(name: string): never {
	throw new Error(`Unexpected test call: ${name}`);
}
