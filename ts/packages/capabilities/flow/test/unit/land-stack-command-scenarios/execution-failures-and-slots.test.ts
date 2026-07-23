import { noopNsCommandIo } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { stripAnsi } from "../../../src/land/stack/graphite-command-channel.ts";
import { flowLandCommand } from "../../../src/ns/commands/land.ts";
import { backupRefSteps } from "../land-stack-backup-ref-fixtures.ts";
import {
	postRestackSubmitCheckSteps,
	prSnapshot,
	prStdout,
} from "../land-stack-script-fixtures.ts";

import {
	featureStackPreflight,
	mergeFeatureAThroughDelete,
	mergeSingleFeatureA,
	singleBranchPreflight,
} from "./feature-stack-fixtures.ts";
import {
	DB_SINGLE_BRANCH,
	DB_TO_CURRENT,
	SHA_A,
	SHA_B,
	cleanRepoChecks,
	mergeFeatureA,
	repoIntro,
} from "./repo-fixtures.ts";
import {
	FakePi,
	ROOT,
	commandMessagesText,
	runLandStack,
	sameArgs,
	step,
	worktreeOutput,
} from "./support.ts";

describe("land-stack command scenarios", () => {
	test("merge failure stops immediately with no local cleanup", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ mergeCode: 1, body }),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			"Merge rejected; stopping stack landing immediately.",
		);
		expect(notifications[0]?.message).not.toContain("Line 1");
		expect(notifications[0]?.message).not.toContain("Line 2");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✗ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>' — exit code 1`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});
	test("verification failure after gh pr merge skips local Graphite cleanup", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ verifyState: "OPEN", includeCleanup: false }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			"PR did not verify as MERGED; local Graphite cleanup skipped",
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "get")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "delete")).toBe(
			false,
		);
	});
	test("ns command resolves absent Slots once and passes it into landing composition", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const pullRequest = prSnapshot({
			number: 101,
			branch: "feature-a",
			base: "main",
			sha: SHA_A,
		});
		const pi = new FakePi([
			...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(pullRequest),
			}),
			step("git", ["worktree", "list", "--porcelain"], { stdout: managedWorktrees }),
		]);
		const packageNames: string[] = [];
		const output: string[] = [];
		const result = await flowLandCommand.run(
			{
				cwd: ROOT,
				env: {},
				commandIo: noopNsCommandIo,
				progress: { isLive: false, phase: () => {} },
				renderCapabilities: { canEmitAnsi: false },
				hasExtension(packageName) {
					packageNames.push(packageName);
					return false;
				},
				exec: async (command, args, options) =>
					await pi.exec(command, args, {
						...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
						...(options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
					}),
				textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
				stdout: (text) => output.push(text),
				stderr: (text) => output.push(text),
			},
			{ argv: ["--yes"] },
		);

		pi.assertDone();
		expect(result.type).toBe("negative");
		expect(packageNames).toEqual(["@nseng-ai/slots"]);
		expect(output.join("\n")).toContain(
			"Detach or remove the blocking worktrees using your worktree workflow",
		);
		expect(
			pi.execCalls.some(
				(call) =>
					(call.command === "gh" && call.args.includes("merge")) ||
					(call.command === "gt" && ["restack", "submit", "delete"].includes(call.args[0] ?? "")) ||
					(call.command === "git" && call.args[0] === "update-ref") ||
					(call.command === "ns" && call.args[0] === "slot"),
			),
		).toBe(false);
	});

	test("managed slot conflict asks for confirmation and frees targeted slots before merging", async () => {
		const managedWorktrees = worktreeOutput([
			{ path: ROOT, branch: "feature-a" },
			{
				path: "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01",
				branch: "feature-a",
			},
		]);
		const script = [
			...singleBranchPreflight(managedWorktrees),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
			}),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).toContain("Command: ns slot free --wt slot-01");
		expect(
			pi.execCalls.findIndex((call) => call.command === "ns" && call.args[0] === "slot"),
		).toBeLessThan(
			pi.execCalls.findIndex((call) => call.command === "gh" && call.args[1] === "merge"),
		);
		expect(
			pi.execCalls.some(
				(call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]),
			),
		).toBe(false);
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
	});
	test("restack failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"], {
				code: 1,
				stderr: "restack failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Restack failed after merging #101; stopping before merging feature-b.",
		);
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(
			false,
		);
	});
	test("submit/update failure after a successful merge reports already-landed PRs", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
			step(
				"gt",
				[
					"submit",
					"--branch",
					"feature-b",
					"--no-stack",
					"--update-only",
					"--no-edit",
					"--no-ai",
					"--no-interactive",
					"--force",
				],
				{
					code: 1,
					stderr: "submit failed",
				},
			),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Submit/update failed after merging #101; stopping before merging feature-b.",
		);
	});
});
