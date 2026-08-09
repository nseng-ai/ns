import { describe, expect, test } from "vitest";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { stripAnsi } from "../../../src/land/stack/graphite-command-channel.ts";
import { backupRefSteps } from "../land-stack-backup-ref-fixtures.ts";
import {
	expectedSquashMergeArgs,
	guardShaStep,
	postRestackSubmitCheckSteps,
	prSnapshot,
	prStdout,
	submitUpdateStep,
} from "../land-stack-script-fixtures.ts";

import {
	featureStackPreflight,
	mergeFeatureAThroughDelete,
	mergeSingleFeatureA,
	singleBranchPreflightWithRefs,
} from "./feature-stack-fixtures.ts";
import { childrenRecheckStep, DB_TO_CURRENT, SHA_A, SHA_B } from "./repo-fixtures.ts";
import { commandMessagesText, messageContentText, runLandStack, step, TRUNK } from "./support.ts";

describe("land-stack command scenarios", () => {
	test("streams command execution as normal scrollback messages", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications, widgets } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(widgets).toEqual([]);
		expect(messages.length).toBeGreaterThan(0);
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("land-stack command stream");
		expect(streamText).toContain("→ Preparing to land 1 PR through feature-a...");
		expect(streamText).toContain("✓ $ git rev-parse --show-toplevel");
		expect(streamText).toContain("→ Merging PR #101 feature-a...");
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'PR 101' --body '<PR body>'`,
		);
		expect(streamText).toContain("→ Merged and verified PR #101 feature-a.");
		expect(streamText).toContain("→ Cleaning up local branch feature-a...");
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).toContain(
			"Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.",
		);
	});
	test("uses merge-loop PR title and body as squash subject/body without displaying the body", async () => {
		const body = "Line 1\n\nLine 2";
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeFeatureAThroughDelete({ refreshTarget: null, title: "Custom squash subject", body }),
		];
		const { pi, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find(
			(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
		);
		expect(mergeCall?.args).toEqual(
			expectedSquashMergeArgs({ number: 101, sha: SHA_A, title: "Custom squash subject", body }),
		);
		expect(mergeCall?.args.at(-1)).toBe(body);

		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			`✓ $ gh pr merge 101 --squash --match-head-commit ${SHA_A} --subject 'Custom squash subject' --body '<PR body>'`,
		);
		expect(streamText).not.toContain("Line 1");
		expect(streamText).not.toContain("Line 2");
	});
	test("passes an empty squash body when the merge-loop PR body is null", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeFeatureAThroughDelete({ refreshTarget: null, body: null }),
		];
		const { pi } = await runLandStack("--yes", script);

		pi.assertDone();
		const mergeCall = pi.execCalls.find(
			(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
		);
		expect(mergeCall?.args).toEqual(
			expectedSquashMergeArgs({ number: 101, sha: SHA_A, body: null }),
		);
		expect(mergeCall?.args.at(-1)).toBe("");
	});
	test("renders final landed PR numbers as terminal hyperlinks", async () => {
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSingleFeatureA(),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(notifications.at(-1)?.message).toContain("#101 feature-a");
		const finalMessage = messages.at(-1);
		expect(messageContentText(finalMessage?.content ?? "")).toContain(
			"✓ Landed 1 PR: #101 feature-a.",
		);
		expect(finalMessage?.details).toBeUndefined();
	});
	test("retains final local Graphite branch when it is checked out in this worktree", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'feature-a' is already checked out at '/repo'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("git switch --detach");
		expect(streamText).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a still checked out; clean up manually with gt sync or direct branch deletion",
		);
		expect(streamText).toContain(
			"Local branch feature-a was kept (still checked out at /repo); delete it manually or run gt sync.",
		);
		expect(streamText).not.toContain("Completed with 1 warning:");
	});
	test("treats final local Graphite delete checkout conflict in another worktree as successful landing", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "fatal: 'feature-a' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
		const streamText = commandMessagesText(messages);
		expect(streamText).not.toContain("✗ $ gt delete feature-a -f -q — exit code 1");
		expect(streamText).not.toContain("fatal: 'feature-a' is already checked out");
		expect(streamText).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a still checked out; clean up manually with gt sync or direct branch deletion",
		);
		expect(streamText).toContain(
			"Local branch feature-a was kept (still checked out at /repo-main); delete it manually or run gt sync.",
		);
		expect(streamText).toContain("✓ Landed 1 PR: #101 feature-a.");
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain(
			"All target PRs were merged, but deleting the local Graphite branch feature-a failed.",
		);
		expect(streamText).not.toContain("land stopped");
		expect(streamText).not.toContain("Failed at:");
	});
	test("halts when final local Graphite branch deletion fails", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: authentication failed\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Delete or repair local Graphite branch feature-a manually, then inspect the stack before rerunning /ns:flow:land.",
		);
		expect(notificationText).toContain("Already landed:");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("✗ $ gt delete feature-a -f -q — exit code 1");
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain(
			"PR #101 merged, but deleting the local Graphite branch feature-a failed.",
		);
		expect(streamText).toContain("land stopped");
		expect(streamText).toContain("Failed at:");
	});
	test("targets the next open branch for Graphite refresh after merging a downstack PR", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
				stdout: `${SHA_A}\n`,
			}),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
			step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 101,
						branch: "feature-a",
						base: TRUNK,
						sha: SHA_A,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			guardShaStep("feature-b", SHA_B),
			step("gt", [
				"get",
				"feature-b",
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
			submitUpdateStep("feature-b"),
			step("git", ["rev-parse", "--verify", "refs/heads/feature-b^{commit}"], {
				stdout: `${SHA_B}\n`,
			}),
			step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
				stdout: prStdout(prSnapshot({ number: 102, branch: "feature-b", base: TRUNK, sha: SHA_B })),
			}),
			step("gh", expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
			step("gh", ["pr", "view", "102", "--json", PR_FIELDS], {
				stdout: prStdout(
					prSnapshot({
						number: 102,
						branch: "feature-b",
						base: TRUNK,
						sha: SHA_B,
						state: "MERGED",
						mergedAt: "2026-05-22T00:00:00Z",
					}),
				),
			}),
			childrenRecheckStep("feature-a", ["feature-b"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			childrenRecheckStep("feature-b", []),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b"]);
		expect(notifications.at(-1)?.level).toBe("success");
	});
});
