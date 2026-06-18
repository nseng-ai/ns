import { describe, expect, test } from "vitest";

import {
	parseCommitMessages,
	parseGtLogStack,
	parseParentBranch,
	RealSubmitMetadataGateway,
} from "@asdl/core/submit";
import { RealSubmitGateway } from "@asdl/core/submit";
import { ScriptedCommandRunner, startupErrorStep, step } from "@asdl/core/testing";

describe("RealSubmitGateway", () => {
	test("checkSubmitReadiness invokes Graphite dry-run submit", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"], { stdout: "ok\n" })]);
		const gateway = new RealSubmitGateway(runner.runner);

		expect(await gateway.checkSubmitReadiness({ cwd: "/repo" })).toMatchObject({ kind: "ready" });
		expect(runner.calls).toEqual([{ command: "gt", args: ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"], cwd: "/repo" }]);
		runner.assertDone();
	});

	test("Graphite command output is streamed to the optional listener", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"], { stdout: "dry-run stdout\n", stderr: "dry-run stderr\n" })]);
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
			step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"], { exitCode: 1, stderr: "This stack must be restacked before submitting.\n" }),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result.kind).toBe("restack_required");
		runner.assertDone();
	});

	test("checkSubmitReadiness classifies trunk-out-of-date dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web", "--dry-run"], {
				exitCode: 1,
				stderr: "ERROR: Aborting submit because trunk branch is out of date and could not be updated.\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "trunk_out_of_date" });
		runner.assertDone();
	});

	test("restackCurrentStack reports conflicts from git conflict facts", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["restack", "--no-interactive"], { exitCode: 1, stderr: "CONFLICT (content): merge conflict\n" }),
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
			step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web"], { stdout: "Created https://github.com/acme/project/pull/456\n" }),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }],
		});
		runner.assertDone();
	});

	test("submitCurrentStack preserves semantic empty-branch failure from zero-exit output", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web"], {
				stdout: "This branch does not introduce any changes:\nGraphite will not be submitted because GitHub does not allow empty PRs.\n",
			}),
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
			step("gt", ["submit", "-nps", "--no-ai", "--no-interactive", "--no-view", "--no-web"], {
				stdout: `🥞 Validating that this Graphite stack is ready to submit...
▸ sdl-extension-api-followup-stack

📝 Preparing to submit PRs for the following branches...
▸ add-sdl-extension-api (No-op)
`,
				stderr: `WARNING: This branch does not introduce any changes:
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
`,
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			semanticFailureCause: { kind: "empty_branch_skipped", branchName: "sdl-extension-api-followup-stack" },
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps branch info without a PR link", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["branch", "info", "--no-interactive"], { stdout: "feature/demo\n\nParent: master\n" })]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "no_current_pr", cause: "no_current_pr" });
		runner.assertDone();
	});

	test("verifyCurrentPr reads PR links from branch info without opening the PR page", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["branch", "info", "--no-interactive"], {
				stdout: "feature/demo\n\nPR #456 (Open) Demo PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
			}),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "present", prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }] });
		runner.assertDone();
	});

	test("verifyCurrentPr maps startup errors", async () => {
		const runner = new ScriptedCommandRunner([startupErrorStep("gt", ["branch", "info", "--no-interactive"], "spawn gt ENOENT")]);
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
		const runner = new ScriptedCommandRunner([{ command: "gt", args: ["branch", "info", "--no-interactive"], exitCode: 124, isKilled: true }]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "timeout" });
		runner.assertDone();
	});

	test("verifyCurrentPr maps generic command failures", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["branch", "info", "--no-interactive"], { exitCode: 2, stderr: "Graphite failed\n" })]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "failed", cause: "command_failed" });
		runner.assertDone();
	});
});

describe("RealSubmitMetadataGateway", () => {
	test("parses Graphite stack and branch metadata facts", () => {
		const log = `◯ parent-branch
│
◉ feature/demo (current)
│
◯ master
`;

		expect(parseGtLogStack(log)).toEqual({ branches: ["parent-branch", "feature/demo", "master"], currentBranch: "feature/demo" });
		expect(parseParentBranch("feature/demo\n\nParent: parent-branch\n")).toBe("parent-branch");
		expect(parseCommitMessages("Add widget\n\nImplement widget.\0Fix tests\0")).toEqual([
			{ headline: "Add widget", body: "Implement widget." },
			{ headline: "Fix tests" },
		]);
	});

	test("inspectSubmitStack skips local diff reads for existing PR branches", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], { stdout: "◯ master\n│\n◉ feature/demo (current)\n" }),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], {
				stdout: "feature/demo\n\nPR #456 (Open) Demo PR\nhttps://github.com/acme/project/pull/456\n\nParent: master\n",
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
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], { stdout: "◯ master\n│\n◉ feature/demo (current)\n" }),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], { stdout: "feature/demo\n\nPR #456 (Open) Demo PR\n\nParent: master\n" }),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		const result = await gateway.inspectSubmitStack({ cwd: "/repo" });

		expect(result).toMatchObject({ ok: false, error: { code: "submit_existing_pr_link_missing" } });
		runner.assertDone();
	});

	test("inspectSubmitStack reads local diffs and commits for new submit branches", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["log", "--stack", "--reverse", "--no-interactive"], { stdout: "◯ master\n│\n◯ feature/demo (current)\n" }),
			step("gt", ["trunk", "--no-interactive"], { stdout: "master\n" }),
			step("gt", ["branch", "info", "--no-interactive", "--branch", "feature/demo"], { stdout: "feature/demo\n\nParent: master\n" }),
			step("git", ["log", "--format=%B%x00", "master..feature/demo"], { stdout: "Add widget\n\nImplement widget.\0" }),
			step("git", ["diff", "master..feature/demo"], { stdout: "diff --git a/src/widget.ts b/src/widget.ts\n+code\n" }),
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

	test("amendBranchMetadataCommit uses Graphite modify without generated markers", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["modify", "--no-interactive", "-m", "Generated title", "-m", "Generated body"], { stdout: "Modified\n" }),
		]);
		const gateway = new RealSubmitMetadataGateway(runner.runner);

		expect(await gateway.amendBranchMetadataCommit({ cwd: "/repo", currentBranch: "feature/demo", branch: "feature/demo", title: "Generated title", body: "Generated body" })).toEqual({ ok: true, value: undefined });
		runner.assertDone();
	});
});
