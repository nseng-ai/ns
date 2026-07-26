import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import {
	GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
	batchedPullRequestFactsGraphqlArgs,
} from "../../../src/land/stack/pr-facts.ts";
import {
	expectedSquashMergeArgs,
	guardShaStep,
	postRestackSubmitCheckSteps,
	prSnapshot,
	prStdout,
	submitUpdateStep,
} from "../land-stack-script-fixtures.ts";

import {
	batchedPrStdout,
	CURRENT,
	DB_SINGLE_BRANCH,
	DB_WITH_DESCENDANT,
	DESCENDANT,
	SHA_A,
	SHA_B,
	SHA_C,
	SHA_D,
	childrenRecheckStep,
	cleanRepoChecks,
	domainRepoIntro,
	repoIntro,
} from "./repo-fixtures.ts";
import { ROOT, TRUNK, step, worktreeOutput, type ScriptedExec } from "./support.ts";
export function initialBranchPlans(options: { featureBBase?: string } = {}): ScriptedExec[] {
	const branches = ["feature-a", "feature-b"];
	const prs = [
		prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: SHA_A }),
		prSnapshot({
			number: 102,
			branch: "feature-b",
			base: options.featureBBase ?? "feature-a",
			sha: SHA_B,
		}),
	];
	return [
		step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
			stdout: `${JSON.stringify({ nameWithOwner: "owner/repo" })}\n`,
		}),
		step("gh", batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, branches), {
			stdout: batchedPrStdout(prs),
		}),
	];
}

export function featureStackPreflight(
	options: {
		dbRows?: string;
		worktrees?: string;
		featureBBase?: string;
	} = {},
): ScriptedExec[] {
	const dbRows = options.dbRows ?? DB_WITH_DESCENDANT;
	const hasDescendants = dbRows.includes(DESCENDANT);
	const worktrees = options.worktrees ?? worktreeOutput([{ path: ROOT, branch: CURRENT }]);
	return [
		...repoIntro({ dbRows }),
		...cleanRepoChecks(),
		...initialBranchPlans(
			options.featureBBase === undefined ? {} : { featureBBase: options.featureBBase },
		),
		step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees }),
		...(hasDescendants
			? [step("git", ["worktree", "list", "--porcelain"], { stdout: worktrees })]
			: []),
	];
}

export function mergeFeatureBThroughVerification(): ScriptedExec[] {
	return [
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
	];
}

export function mergeFeatureBWithDescendant(): ScriptedExec[] {
	return [
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
		...postRestackSubmitCheckSteps({
			branch: DESCENDANT,
			sha: SHA_C,
			prNumber: 103,
			base: "feature-b",
		}),
		submitUpdateStep(DESCENDANT),
	];
}

export function mergeFeatureBWithForkedDescendants(): ScriptedExec[] {
	return [
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
		childrenRecheckStep("feature-b", [DESCENDANT, "feature-d"]),
		step("gt", ["delete", "feature-b", "-f", "-q"]),
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps({
			branch: DESCENDANT,
			sha: SHA_C,
			prNumber: 103,
			base: "feature-b",
		}),
		submitUpdateStep(DESCENDANT),
		step("gt", ["restack", "--branch", "feature-d", "--upstack", "--no-interactive"]),
		...postRestackSubmitCheckSteps({
			branch: "feature-d",
			sha: SHA_D,
			prNumber: 104,
			base: "feature-b",
		}),
		submitUpdateStep("feature-d"),
	];
}

export function mergeFeatureBWithDescendantRestackFailure(): ScriptedExec[] {
	return [
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
		step("gt", ["restack", "--branch", DESCENDANT, "--upstack", "--no-interactive"], {
			code: 1,
			stderr: "restack failed",
		}),
	];
}

export function singleBranchPreflight(worktrees: string): ScriptedExec[] {
	return singleBranchPreflightWithRefs({ localSha: SHA_A, prSha: SHA_A, worktrees });
}

export function singleBranchPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return singleBranchPreflightWithRepoIntro(repoIntro, options);
}

export function singleBranchDomainPreflightWithRefs(options: {
	localSha: string;
	prSha: string;
	worktrees?: string;
	dbRows?: string;
}): ScriptedExec[] {
	return singleBranchPreflightWithRepoIntro(domainRepoIntro, options);
}

export function singleBranchPreflightWithRepoIntro(
	loadRepoIntro: typeof repoIntro,
	options: {
		localSha: string;
		prSha: string;
		worktrees?: string;
		dbRows?: string;
	},
): ScriptedExec[] {
	return [
		...loadRepoIntro({
			current: "feature-a",
			dbRows: options.dbRows ?? DB_SINGLE_BRANCH,
			branchShaOverrides: { "feature-a": options.localSha },
		}),
		...cleanRepoChecks(),
		step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
			stdout: `${JSON.stringify({ nameWithOwner: "owner/repo" })}\n`,
		}),
		step(
			"gh",
			batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, ["feature-a"]),
			{
				stdout: batchedPrStdout([
					prSnapshot({ number: 101, branch: "feature-a", base: TRUNK, sha: options.prSha }),
				]),
			},
		),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: options.worktrees ?? worktreeOutput([{ path: ROOT, branch: "feature-a" }]),
		}),
	];
}

export function mergeFeatureAThroughDelete(
	options: { refreshTarget?: string | null; title?: string; body?: string | null } = {},
): ScriptedExec[] {
	const steps = [
		step("git", ["rev-parse", "--verify", "refs/heads/feature-a^{commit}"], {
			stdout: `${SHA_A}\n`,
		}),
		step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					...(options.title === undefined ? {} : { title: options.title }),
					...(options.body === undefined ? {} : { body: options.body }),
				}),
			),
		}),
		step(
			"gh",
			expectedSquashMergeArgs({
				number: 101,
				sha: SHA_A,
				...(options.title === undefined ? {} : { title: options.title }),
				...(options.body === undefined ? {} : { body: options.body }),
			}),
		),
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
	];
	const refreshTarget = options.refreshTarget === undefined ? "feature-b" : options.refreshTarget;
	if (refreshTarget) {
		steps.push(
			guardShaStep(refreshTarget, SHA_B),
			step("gt", [
				"get",
				refreshTarget,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
		);
	}
	steps.push(
		childrenRecheckStep("feature-a", refreshTarget ? ["feature-b"] : []),
		step("gt", ["delete", "feature-a", "-f", "-q"]),
	);
	return steps;
}

export function mergeSingleFeatureA(): ScriptedExec[] {
	return mergeFeatureAThroughDelete({ refreshTarget: null });
}
