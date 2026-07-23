import { formatCommand } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";
import { runLandCli } from "../../../src/land/land.ts";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { stripAnsi } from "../../../src/land/stack/graphite-command-channel.ts";
import {
	batchedPullRequestFactsGraphqlArgs,
	GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
} from "../../../src/land/stack/pr-facts.ts";
import { backupRefSteps, backupSnapshotFetchArgs } from "../land-stack-backup-ref-fixtures.ts";
import {
	expectedSquashMergeArgs,
	guardShaStep,
	postRestackSubmitCheckSteps,
	prSnapshot,
} from "../land-stack-script-fixtures.ts";

import {
	featureStackPreflight,
	mergeFeatureAThroughDelete,
	mergeFeatureBThroughVerification,
	mergeFeatureBWithDescendant,
	mergeFeatureBWithDescendantRestackFailure,
	mergeFeatureBWithForkedDescendants,
} from "./feature-stack-fixtures.ts";
import { numberedDb, numberedPreflight } from "./linear-stack-fixtures.ts";
import {
	batchedPrStdout,
	BRANCH_SHAS,
	childrenRecheckStep,
	cleanRepoChecks,
	CURRENT,
	DB_FORKED_CURRENT,
	DB_TO_CURRENT,
	DESCENDANT,
	fromManagedCurrentSlot,
	mergeFeatureA,
	numberedBranch,
	numberedSha,
	repoIntro,
	SHA_A,
	SHA_B,
	SHA_C,
	SHA_D,
} from "./repo-fixtures.ts";
import {
	captureConsole,
	commandMessagesText,
	CURRENT_SLOT_ROOT,
	FakePi,
	ROOT,
	runLandStack,
	sameArgs,
	step,
	TRUNK,
	worktreeOutput,
} from "./support.ts";
import type { Confirmation } from "./support.ts";

describe("land-stack command scenarios", () => {
	test.each([
		{ mode: "decline", hasUI: true },
		{ mode: "noninteractive refusal", hasUI: false },
	])("managed current slot canonical stack $mode performs no mutation", async ({ hasUI }) => {
		const { pi, confirmations } = await captureConsole(() =>
			runLandStack("", fromManagedCurrentSlot(numberedPreflight({ end: 3, current: 3 })), {
				cwd: CURRENT_SLOT_ROOT,
				hasUI,
				confirms: [false],
			}),
		);

		pi.assertDone();
		expect(confirmations).toHaveLength(hasUI ? 1 : 0);
		expect(
			pi.execCalls.some(
				(call) =>
					(call.command === "gh" && call.args.includes("merge")) ||
					(call.command === "ns" && call.args[0] === "slot") ||
					(call.command === "gt" && call.args[0] === "delete") ||
					(call.command === "git" && call.args[0] === "update-ref"),
			),
		).toBe(false);
	});
	test("happy path merges bottom-to-current and restacks but does not merge descendants", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendant(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "git" &&
					sameArgs(call.args, backupSnapshotFetchArgs(["feature-a", "feature-b", DESCENDANT])),
			),
		).toBe(true);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "restack")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT]);
		const submitCalls = pi.execCalls.filter(
			(call) => call.command === "gt" && call.args[0] === "submit",
		);
		expect(submitCalls.map((call) => call.args)).toEqual([
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
			[
				"submit",
				"--branch",
				DESCENDANT,
				"--no-stack",
				"--update-only",
				"--no-edit",
				"--no-ai",
				"--no-interactive",
				"--force",
			],
		]);
		const merge101Index = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" &&
				sameArgs(call.args, expectedSquashMergeArgs({ number: 101, sha: SHA_A })),
		);
		const restackFeatureBIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gt" &&
				sameArgs(call.args, ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
		);
		const submitFeatureBIndex = pi.execCalls.findIndex((call) => call === submitCalls[0]);
		const merge102Index = pi.execCalls.findIndex(
			(call) =>
				call.command === "gh" &&
				sameArgs(call.args, expectedSquashMergeArgs({ number: 102, sha: SHA_B })),
		);
		expect(merge101Index).toBeLessThan(restackFeatureBIndex);
		expect(restackFeatureBIndex).toBeLessThan(submitFeatureBIndex);
		expect(submitFeatureBIndex).toBeLessThan(merge102Index);
		const descendantRestackCallIndex = pi.execCalls.findIndex(
			(call) =>
				call.command === "gt" &&
				sameArgs(call.args, ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		);
		expect(descendantRestackCallIndex).toBeGreaterThanOrEqual(0);
		expect(
			pi.execCalls
				.slice(descendantRestackCallIndex + 1)
				.some(
					(call) =>
						call.command === "git" &&
						sameArgs(call.args, ["rev-parse", "--verify", `refs/heads/${DESCENDANT}^{commit}`]),
				),
		).toBe(true);
		expect(
			pi.execCalls
				.slice(descendantRestackCallIndex + 1)
				.some((call) => call.command === "gt" && call.args[0] === "get"),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 2 PRs: #101 feature-a, #102 feature-b.",
		);
		expect(commandMessagesText(messages)).toContain("Left open/restacked: feature-c.");
	});
	test("happy path restacks and updates multiple descendant roots above the current branch", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_FORKED_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT, "feature-d"], {
				shas: BRANCH_SHAS,
			}),
			...mergeFeatureA(),
			...mergeFeatureBWithForkedDescendants(),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "restack")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "submit")
				.map((call) => call.args[2]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(notifications.at(-1)?.level).toBe("success");
		expect(commandMessagesText(messages)).toContain("Left open/restacked: feature-c, feature-d.");
	});
	test("optional descendant refresh failure still attempts later roots and skips unsafe deletion", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_FORKED_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT, "feature-d"], {
				shas: BRANCH_SHAS,
			}),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step(
				"gt",
				[
					"get",
					DESCENDANT,
					"--downstack",
					"--no-restack",
					"--no-checkout",
					"--force",
					"--no-interactive",
				],
				{ code: 1, stderr: "refresh failed" },
			),
			guardShaStep("feature-d", SHA_D),
			step("gt", [
				"get",
				"feature-d",
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(
			pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "get")
				.map((call) => call.args[1]),
		).toEqual(["feature-b", DESCENDANT, "feature-d"]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" &&
					call.args[0] === "restack" &&
					[DESCENDANT, "feature-d"].includes(call.args[2] ?? ""),
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"Left open; restack/update needs follow-up: feature-c, feature-d.",
		);
		expect(streamText).toContain(
			"Graphite refresh for descendant branch feature-c failed; local branch feature-b cleanup and descendant restack/update were skipped.",
		);
		expect(streamText).not.toContain("Left open/restacked: feature-c, feature-d.");
	});
	test("descendant managed slot does not block landing and skips descendant maintenance", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "get" && call.args[1] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Free slot-07 for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain(
			"Final local Graphite cleanup for feature-b and descendant restack/update were skipped",
		);
		expect(streamText).toContain("slot-07 feature-c");
	});
	test("descendant manual worktree does not block landing and skips descendant maintenance", async () => {
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: "/tmp/manual-descendant", branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Detach /tmp/manual-descendant for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update skipped: feature-c.");
		expect(streamText).toContain("/tmp/manual-descendant");
	});
	test("landing-scope managed slot cleanup is targeted and leaves descendant slots alone", async () => {
		const landingSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-01";
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const initialWorktrees = worktreeOutput([
			{ path: ROOT, branch: CURRENT },
			{ path: landingSlotPath, branch: "feature-a" },
			{ path: descendantSlotPath, branch: DESCENDANT },
		]);
		const script = [
			...featureStackPreflight({ worktrees: initialWorktrees }),
			step("ns", ["slot", "free", "--wt", "slot-01"]),
			...cleanRepoChecks(),
			step("git", ["worktree", "list", "--porcelain"], {
				stdout: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi, notifications, confirmations } = await runLandStack("--yes", script, {
			confirms: [true],
		});

		pi.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Free landing slots?");
		expect(confirmations[0]?.message).toContain("slot-01 feature-a");
		expect(confirmations[0]?.message).not.toContain("slot-07 feature-c");
		expect(
			pi.execCalls.some(
				(call) => call.command === "ns" && sameArgs(call.args, ["slot", "free", "--wt", "slot-01"]),
			),
		).toBe(true);
		expect(
			pi.execCalls.some(
				(call) => call.command === "slot" && sameArgs(call.args, ["gt", "free-stack"]),
			),
		).toBe(false);
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Free slot-07 for feature-c; then restack/update feature-c.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
	});
	test("non-interactive descendant-only slot conflict proceeds with --yes", async () => {
		const descendantSlotPath = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-07";
		const script = [
			...featureStackPreflight({
				worktrees: worktreeOutput([
					{ path: ROOT, branch: CURRENT },
					{ path: descendantSlotPath, branch: DESCENDANT },
				]),
			}),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
		];
		const { pi } = await captureConsole(() => runLandStack("--yes", script, { hasUI: false }));

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101", "102"]);
	});
	test("optional descendant gt get checkout conflict completes successfully with deferred note", async () => {
		const getArgs = [
			"get",
			DESCENDANT,
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		];
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step("gt", getArgs, {
				code: 1,
				stderr: "fatal: 'main' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 2 PRs: #101 feature-a, #102 feature-b.",
		);
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Left open; restack/update deferred: feature-c.");
		expect(streamText).toContain(
			"→ Deferred optional descendant maintenance for feature-c because main is checked out at /repo-main.",
		);
		expect(streamText).toContain("Notes:");
		expect(streamText).toContain(
			"Optional descendant restack/update was deferred because Graphite could not refresh descendant branch feature-c: main is checked out at /repo-main.",
		);
		expect(streamText).not.toContain(`✗ $ ${formatCommand("gt", getArgs)} — exit code 1`);
		expect(streamText).not.toContain("Completed with 1 warning:");
		expect(streamText).not.toContain("fatal: 'main' is already checked out");
		expect(streamText).not.toContain("land stopped");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "delete" && call.args[1] === "feature-b",
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "restack" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});
	test("required next-landing gt get checkout conflict stops before merging the next target PR", async () => {
		const getArgs = [
			"get",
			"feature-b",
			"--downstack",
			"--no-restack",
			"--no-checkout",
			"--force",
			"--no-interactive",
		];
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureA({ includeCleanup: false }),
			guardShaStep("feature-b", SHA_B),
			step("gt", getArgs, {
				code: 1,
				stderr: "fatal: 'main' is already checked out at '/repo-main'\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		expect(notifications.at(-1)?.message).toContain("land stopped at feature-b");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Graphite could not refresh next landing branch feature-b: main is checked out at /repo-main.",
		);
		expect(streamText).toContain("Suggested next action: Switch/detach /repo-main from main");
		expect(streamText).toContain(formatCommand("gt", getArgs));
		expect(
			pi.execCalls
				.filter(
					(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
				)
				.map((call) => call.args[2]),
		).toEqual(["101"]);
	});
	test("skips post-restack submit when fresh PR metadata is already current", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: TRUNK,
			}),
			...mergeFeatureBThroughVerification(),
			childrenRecheckStep("feature-b", []),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" && call.args[0] === "submit" && call.args[2] === "feature-b",
			),
		).toBe(false);
		expect(commandMessagesText(messages)).toContain(
			"→ Skipped gt submit for feature-b; PR metadata already current.",
		);
	});
	test("post-restack PR read failure halts required next-landing maintenance", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete(),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
			guardShaStep("feature-b", SHA_B),
			step("gh", ["pr", "view", "feature-b", "--json", PR_FIELDS], {
				code: 1,
				stderr: "PR lookup failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("could not verify PR metadata for feature-b after restack");
		expect(pi.execCalls.some((call) => call.command === "gt" && call.args[0] === "submit")).toBe(
			false,
		);
	});
	test("post-restack PR read failure warns for optional descendant maintenance", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBThroughVerification(),
			guardShaStep(DESCENDANT, SHA_C),
			step("gt", [
				"get",
				DESCENDANT,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep("feature-b", [DESCENDANT]),
			step("gt", ["delete", "feature-b", "-f", "-q"]),
			step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
			guardShaStep(DESCENDANT, SHA_C),
			step("gh", ["pr", "view", DESCENDANT, "--json", PR_FIELDS], {
				code: 1,
				stderr: "PR lookup failed",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain(
			"PR metadata for feature-c could not be verified after optional descendant restack",
		);
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});
	test("optional descendant maintenance failure completes with a warning", async () => {
		const script = [
			...featureStackPreflight(),
			...backupRefSteps(["feature-a", "feature-b", DESCENDANT]),
			...mergeFeatureA(),
			...mergeFeatureBWithDescendantRestackFailure(),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("warning");
		const notificationText = stripAnsi(notifications.at(-1)?.message ?? "");
		expect(notificationText).toContain(
			"Resolve restack failures for feature-c, then update that PR manually.",
		);
		expect(notificationText).not.toContain("Landed 2 PRs");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("Completed with 1 warning:");
		expect(streamText).toContain(
			"Restack failed after merging #102; descendant branch feature-c was left for manual restack/update.",
		);
		expect(streamText).not.toContain("land stopped");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gt" && call.args[0] === "submit" && call.args[2] === DESCENDANT,
			),
		).toBe(false);
	});
	test("explains cleanup rebase conflicts after PRs have merged", async () => {
		const script = [
			...featureStackPreflight({ dbRows: DB_TO_CURRENT }),
			...backupRefSteps(["feature-a", "feature-b"]),
			...mergeFeatureAThroughDelete().slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: [
					"CONFLICT (content): Merge conflict in skills/ns-typescript/SKILL.md",
					"error: could not apply 01034275d... Migrate optional-undefined preserves to typed explicit contracts",
					"hint: Resolve all conflicts manually, mark them as resolved with git add/rm, then run git rebase --continue.",
				].join("\n"),
			}),
		];
		const { pi, messages, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("land stopped.");
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("#101 feature-a");
		expect(streamText).toContain(
			"Graphite cleanup for local branch feature-a stopped during branch deletion with an in-progress Git operation or conflicts.",
		);
		expect(streamText).toContain("The repository may now be mid-rebase");
		expect(streamText).toContain(
			"Run git status. Resolve the conflicts and continue the Git operation",
		);
		expect(streamText).toContain("git rebase --abort");
	});
	test.each([
		{
			state: "MERGED" as const,
			expected: ["already MERGED", "repair/reparent/restack", "Submit", "rerun /ns:flow:land"],
		},
		{
			state: "CLOSED" as const,
			expected: ["is CLOSED", "Reopen", "remove, replace, or retarget", "rerun /ns:flow:land"],
		},
	])("dispatch rejects a batched $state PR before confirmation or mutation", async (scenario) => {
		const branches = [numberedBranch(1), numberedBranch(2), numberedBranch(3)];
		const prs = branches.map((branch, offset) => {
			const index = offset + 1;
			return prSnapshot({
				number: 200 + index,
				branch,
				base: index === 1 ? TRUNK : numberedBranch(index - 1),
				sha: numberedSha(index),
				state: index === 1 ? scenario.state : "OPEN",
				title: `PR ${200 + index}`,
			});
		});
		const pi = new FakePi([
			...repoIntro({ current: numberedBranch(3), dbRows: numberedDb(1, 3) }),
			...cleanRepoChecks(),
			step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
				stdout: `${JSON.stringify({ nameWithOwner: "owner/repo" })}\n`,
			}),
			step("gh", batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, branches), {
				stdout: batchedPrStdout(prs),
			}),
		]);
		const output: string[] = [];
		const confirmations: Confirmation[] = [];
		const progressIo = {
			phase: (message: string) => output.push(message),
			notify: (message: string) => output.push(message),
			message: (message: string) => output.push(message),
			clearPhase: () => {},
		};

		const exitCode = await runLandCli({
			hasSlotsExtension: true,
			cwd: ROOT,
			rawArgs: "",
			exec: async (command, args, options) => await pi.exec(command, args, options),
			stdout: (text) => output.push(text),
			stderr: (text) => output.push(text),
			progressIo,
			confirm: async (title, message) => {
				confirmations.push({ title, message });
				return true;
			},
		});

		pi.assertDone();
		expect(exitCode).toBe(1);
		expect(confirmations).toEqual([]);
		const text = output.join("\n");
		expect(text).toContain("#201 feature-1");
		for (const expected of scenario.expected) expect(text).toContain(expected);
		expect(text).not.toContain("unexpected shape");
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
});
