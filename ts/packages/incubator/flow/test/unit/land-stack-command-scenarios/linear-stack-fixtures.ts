import { PR_FIELDS } from "../../../src/land/stack/constants.ts";
import {
	batchedPullRequestFactsGraphqlArgs,
	GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
} from "../../../src/land/stack/pr-facts.ts";
import { backupRefSteps } from "../land-stack-backup-ref-fixtures.ts";
import {
	expectedSquashMergeArgs,
	guardShaStep,
	postRestackSubmitCheckSteps,
	prSnapshot,
	prStdout,
	submitUpdateStep,
} from "../land-stack-script-fixtures.ts";
import { metadataDbJson } from "../land-test-helpers.ts";

import {
	batchedPrStdout,
	childrenRecheckStep,
	cleanRepoChecks,
	numberedBranch,
	numberedSha,
	repoIntro,
} from "./repo-fixtures.ts";
import { ROOT, step, TRUNK, worktreeOutput, type ScriptedExec } from "./support.ts";
export function numberedDb(
	start: number,
	end: number,
	options: { trunk?: string; current?: number } = {},
): string {
	const trunk = options.trunk ?? TRUNK;
	const current = options.current ?? end;
	return metadataDbJson([
		{ branch: trunk, children: start <= end ? [numberedBranch(start)] : [], trunk: true },
		...Array.from({ length: end - start + 1 }, (_, offset) => {
			const index = start + offset;
			return {
				branch: numberedBranch(index),
				parent: index === start ? trunk : numberedBranch(index - 1),
				children: index === current ? [] : [numberedBranch(index + 1)],
			};
		}),
	]);
}

export function numberedPreflight(options: {
	start?: number;
	end: number;
	current: number;
	prShaOverrides?: Record<number, string>;
}): ScriptedExec[] {
	const start = options.start ?? 1;
	const currentBranch = numberedBranch(options.current);
	const planBranches = Array.from({ length: options.end - start + 1 }, (_, offset) =>
		numberedBranch(start + offset),
	);
	return [
		...repoIntro({
			current: currentBranch,
			dbRows: numberedDb(start, options.end, { current: options.current }),
		}),
		...cleanRepoChecks(),
		...numberedPreflightPrSteps({
			start,
			planBranches,
			...(options.prShaOverrides === undefined ? {} : { prShaOverrides: options.prShaOverrides }),
		}),
		step("git", ["worktree", "list", "--porcelain"], {
			stdout: worktreeOutput([{ path: ROOT, branch: currentBranch }]),
		}),
	];
}

export function numberedPreflightPrSteps(options: {
	start: number;
	planBranches: readonly string[];
	prShaOverrides?: Record<number, string>;
}): ScriptedExec[] {
	const prs = options.planBranches.map((branch) => {
		const index = Number(branch.replace("feature-", ""));
		const localSha = numberedSha(index);
		const prSha = options.prShaOverrides?.[index] ?? localSha;
		return prSnapshot({
			number: 200 + index,
			branch,
			base: index === options.start ? TRUNK : numberedBranch(index - 1),
			sha: prSha,
			title: `PR ${200 + index}`,
		});
	});
	return [
		step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
			stdout: `${JSON.stringify({ nameWithOwner: "owner/repo" })}\n`,
		}),
		step(
			"gh",
			batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, options.planBranches),
			{ stdout: batchedPrStdout(prs) },
		),
	];
}

export function backupRefStepsForNumberedBranches(start: number, end: number): ScriptedExec[] {
	const shas: Record<string, string> = {};
	for (let index = start; index <= end; index += 1) {
		shas[numberedBranch(index)] = numberedSha(index);
	}
	return backupRefSteps(
		Array.from({ length: end - start + 1 }, (_, offset) => numberedBranch(start + offset)),
		{ shas },
	);
}

export function linearStackLandingScript(size: number): ScriptedExec[] {
	return [
		...numberedPreflight({ end: size, current: size }),
		...backupRefStepsForNumberedBranches(1, size),
		...Array.from({ length: size }, (_, offset) => offset + 1).flatMap((index) =>
			mergeNumberedBranch(
				index,
				index === size ? { finalCheckedOut: true } : { next: index + 1, stackEnd: size },
			),
		),
	].flat();
}

export type MergeNumberedBranchOptions =
	| { next: number; stackEnd: number; finalCheckedOut?: boolean; mergeCode?: number }
	| { next?: undefined; stackEnd?: undefined; finalCheckedOut?: boolean; mergeCode?: number };

export function mergeNumberedBranch(
	index: number,
	options: MergeNumberedBranchOptions = {},
): ScriptedExec[] {
	const branch = numberedBranch(index);
	const sha = numberedSha(index);
	const prNumber = 200 + index;
	const steps: ScriptedExec[] = [
		step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], { stdout: `${sha}\n` }),
		step("gh", ["pr", "view", branch, "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({ number: prNumber, branch, base: TRUNK, sha, title: `PR ${prNumber}` }),
			),
		}),
		step("gh", expectedSquashMergeArgs({ number: prNumber, sha, title: `PR ${prNumber}` }), {
			code: options.mergeCode ?? 0,
			stderr: options.mergeCode ? "merge blocked" : "",
		}),
		step("gh", ["pr", "view", String(prNumber), "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: prNumber,
					branch,
					base: TRUNK,
					sha,
					state: "MERGED",
					mergedAt: "2026-05-22T00:00:00Z",
					title: `PR ${prNumber}`,
				}),
			),
		}),
	];
	if (options.mergeCode) {
		return steps.slice(0, 3);
	}
	if (options.next !== undefined) {
		const nextBranch = numberedBranch(options.next);
		steps.push(
			guardShaStep(nextBranch, numberedSha(options.next)),
			step("gt", [
				"get",
				nextBranch,
				"--downstack",
				"--no-restack",
				"--no-checkout",
				"--force",
				"--no-interactive",
			]),
			childrenRecheckStep(branch, [nextBranch]),
			step("gt", ["delete", branch, "-f", "-q"]),
			step("gt", ["restack", "--branch", nextBranch, "--only", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: nextBranch,
				sha: numberedSha(options.next),
				prNumber: 200 + options.next,
				base: branch,
			}),
		);
		steps.push(submitUpdateStep(nextBranch));
		return steps;
	}
	steps.push(
		childrenRecheckStep(branch, []),
		step(
			"gt",
			["delete", branch, "-f", "-q"],
			options.finalCheckedOut
				? { code: 1, stderr: `fatal: '${branch}' is already checked out at '/repo'\n` }
				: undefined,
		),
	);
	return steps;
}
