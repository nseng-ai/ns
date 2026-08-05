import { noopNsCommandIo } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";
import type { PullRequestFacts } from "../../../src/land/api.ts";
import { runLandWorkflow } from "../../../src/land/land.ts";
import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import { stripAnsi } from "../../../src/land/stack/graphite-command-channel.ts";
import {
	batchedPullRequestFactsGraphqlArgs,
	GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
} from "../../../src/land/stack/pr-facts.ts";
import { fakeGitStateFs } from "../git-state-fs-support.ts";
import { backupRefSteps } from "../land-stack-backup-ref-fixtures.ts";
import { prSnapshot, prStdout } from "../land-stack-script-fixtures.ts";

import {
	featureStackPreflight,
	mergeFeatureAThroughDelete,
	singleBranchPreflightWithRefs,
} from "./feature-stack-fixtures.ts";
import { linearStackLandingScript } from "./linear-stack-fixtures.ts";
import {
	batchedPrStdout,
	cleanRepoChecks,
	CURRENT,
	DB_SINGLE_BRANCH,
	DB_TO_CURRENT,
	repoIntro,
	SHA_A,
} from "./repo-fixtures.ts";
import {
	commandMessagesText,
	FakeLandExecutionApi,
	ROOT,
	runLandStack,
	type ScriptedExec,
	step,
	TRUNK,
	worktreeOutput,
} from "./support.ts";
import type { Confirmation } from "./support.ts";

describe("land-stack command scenarios", () => {
	function badInitialPrPreflight(pr: PullRequestFacts): ScriptedExec[] {
		const branches = ["feature-a"];
		return [
			...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
			...cleanRepoChecks(),
			step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
				stdout: `${JSON.stringify({ nameWithOwner: "owner/repo" })}\n`,
			}),
			step("gh", batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, branches), {
				stdout: batchedPrStdout([pr]),
			}),
		];
	}

	test("dirty repo refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"], { stdout: " M file.ts\n" }),
		];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("Working tree is dirty");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});
	test("in-progress merge refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"]),
		];
		const { pi, notifications } = await runLandStack("--yes", script, {
			executeOptions: {
				gitStateFs: fakeGitStateFs([
					`${ROOT}/.git`,
					`${ROOT}/.git/HEAD`,
					`${ROOT}/.git/MERGE_HEAD`,
				]),
			},
		});

		pi.assertDone();
		expect(notifications[0]?.message).toContain("A merge is in progress");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});
	test("in-progress bisect refuses before mutation", async () => {
		const script = [
			...repoIntro({ dbRows: DB_TO_CURRENT }),
			step("git", ["status", "--porcelain=v1"]),
		];
		const { pi, notifications } = await runLandStack("--yes", script, {
			executeOptions: {
				gitStateFs: fakeGitStateFs([
					`${ROOT}/.git`,
					`${ROOT}/.git/HEAD`,
					`${ROOT}/.git/BISECT_LOG`,
				]),
			},
		});

		pi.assertDone();
		expect(notifications[0]?.message).toContain("A bisect is in progress");
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});
	test("missing local branch in stack metadata refuses before mutation", async () => {
		const script = [...repoIntro({ dbRows: DB_TO_CURRENT, liveBranches: [TRUNK, "feature-b"] })];
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain(
			"Graphite metadata (/repo/.git/.graphite_metadata.db) has no entry for feature-a",
		);
		expect(pi.execCalls.some((call) => call.command === "gh")).toBe(false);
	});
	test("manual worktree conflict refuses before mutation", async () => {
		const script = featureStackPreflight({
			dbRows: DB_TO_CURRENT,
			worktrees: worktreeOutput([
				{ path: ROOT, branch: CURRENT },
				{ path: "/tmp/manual", branch: "feature-a" },
			]),
		});
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("non-slot worktree");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
	test("treats missing local branch during Graphite delete as successful cleanup", async () => {
		const mergeSteps = mergeFeatureAThroughDelete({ refreshTarget: null });
		const script = [
			...singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A }),
			...backupRefSteps(["feature-a"]),
			...mergeSteps.slice(0, -1),
			step("gt", ["delete", "feature-a", "-f", "-q"], {
				code: 1,
				stderr: "ERROR: Could not find branch feature-a.\n",
			}),
		];
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");
		expect(stripAnsi(notifications.at(-1)?.message ?? "")).toContain(
			"Landed 1 PR: #101 feature-a.",
		);
		expect(commandMessagesText(messages)).toContain(
			"✓ $ gt delete feature-a -f -q — branch feature-a already absent",
		);
	});
	test("dispatch refuses single-branch non-interactive landing before mutation without --yes", async () => {
		const pullRequest = prSnapshot({
			number: 101,
			branch: "feature-a",
			base: TRUNK,
			sha: SHA_A,
		});
		const pi = new FakeLandExecutionApi([
			...repoIntro({ current: "feature-a", dbRows: DB_SINGLE_BRANCH }),
			step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
				stdout: prStdout(pullRequest),
			}),
		]);
		const output: string[] = [];
		const progressIo = {
			phase: (message: string) => output.push(message),
			notify: (message: string) => output.push(message),
			message: (message: string) => output.push(message),
			clearPhase: () => {},
		};

		const result = await runLandWorkflow({
			cwd: ROOT,
			request: {
				shouldSkipConfirmation: false,
				isDryRun: false,
				shouldFreeSlot: false,
				shouldContinueUpstack: false,
				shouldShowHelp: false,
				shouldStreamVerboseOutput: false,
			},
			exec: async (command, args, options) => await pi.exec(command, args, options),
			progressIo,
		});

		pi.assertDone();
		expect(result.type).toBe("failed");
		expect(result).toMatchObject({ type: "failed", failure: { outcome: "refusal" } });
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
	test("dispatch prompts once with the canonical plan after healthy preflight", async () => {
		const pi = new FakeLandExecutionApi(linearStackLandingScript(3));
		const confirmations: Confirmation[] = [];

		const result = await runLandWorkflow({
			cwd: ROOT,
			request: {
				shouldSkipConfirmation: false,
				isDryRun: false,
				shouldFreeSlot: true,
				shouldContinueUpstack: false,
				shouldShowHelp: false,
				shouldStreamVerboseOutput: false,
			},
			exec: async (command, args, options) => await pi.exec(command, args, options),
			progressIo: noopNsCommandIo,
			confirm: async (title, message) => {
				confirmations.push({ title, message });
				return true;
			},
		});

		pi.assertDone();
		expect(result.type).not.toBe("failed");
		expect(confirmations.map((confirmation) => confirmation.title)).toEqual([
			"Land this stack path?",
		]);
		expect(confirmations[0]?.message).toContain("Land Graphite stack path: main -> feature-1");
		expect(confirmations[0]?.message).toContain("Landing target branch: feature-3");
	});
	test("PR preflight failures refuse before worktree checks or mutation", async () => {
		const script = badInitialPrPreflight(
			prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A, isDraft: true }),
		);
		const { pi, notifications } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications[0]?.message).toContain("is a draft");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "worktree")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "gh" && call.args[1] === "merge")).toBe(
			false,
		);
	});
});
