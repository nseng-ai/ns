import type { ExecResult } from "@nseng-ai/foundation/command";
import type { PullRequestSnapshot } from "../../src/land/stack/types.ts";
import { metadataDbJson, TOPOLOGY_COMMAND } from "./land-test-helpers.ts";

const PR_FIELDS =
	"number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";

const TRUNK = "main";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

export interface LandStackScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

export interface MergeFeatureAOptions {
	mergeCode?: number;
	verifyState?: string;
	includeCleanup?: boolean;
	refreshTarget?: string | null;
	title?: string;
	body?: string | null;
}

export function createMergeFeatureASteps(
	topologyArgs: readonly string[],
): (options?: MergeFeatureAOptions) => LandStackScriptedExec[] {
	return (options = {}) => mergeFeatureA(topologyArgs, options);
}

function mergeFeatureA(
	topologyArgs: readonly string[],
	options: MergeFeatureAOptions,
): LandStackScriptedExec[] {
	const includeCleanup = options.includeCleanup ?? true;
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
			{
				code: options.mergeCode ?? 0,
				stderr: options.mergeCode ? "merge blocked" : "",
			},
		),
	];
	if (options.mergeCode) {
		return steps;
	}
	steps.push(
		step("gh", ["pr", "view", "101", "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: 101,
					branch: "feature-a",
					base: TRUNK,
					sha: SHA_A,
					state: options.verifyState ?? "MERGED",
					mergedAt: options.verifyState === "OPEN" ? null : "2026-05-22T00:00:00Z",
				}),
			),
		}),
	);
	if (includeCleanup) {
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
			childrenRecheckStep(topologyArgs, "feature-a", ["feature-b"]),
			step("gt", ["delete", "feature-a", "-f", "-q"]),
			step("gt", ["restack", "--branch", "feature-b", "--only", "--no-interactive"]),
			...postRestackSubmitCheckSteps({
				branch: "feature-b",
				sha: SHA_B,
				prNumber: 102,
				base: "feature-a",
			}),
		);
		steps.push(submitUpdateStep("feature-b"));
	}
	return steps;
}

function step(
	command: string,
	args: string[],
	result?: Partial<ExecResult>,
): LandStackScriptedExec {
	return { command, args, result };
}

export function guardShaStep(branch: string, sha: string): LandStackScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {
		stdout: `${sha}\n`,
	});
}

export function submitUpdateStep(branch: string): LandStackScriptedExec {
	return step("gt", [
		"submit",
		"--branch",
		branch,
		"--no-stack",
		"--update-only",
		"--no-edit",
		"--no-ai",
		"--no-interactive",
		"--force",
	]);
}

export function createChildrenRecheckStep(
	topologyArgs: readonly string[],
): (branch: string, children: string[]) => LandStackScriptedExec {
	return (branch, children) => childrenRecheckStep(topologyArgs, branch, children);
}

function childrenRecheckStep(
	topologyArgs: readonly string[],
	branch: string,
	children: string[],
): LandStackScriptedExec {
	return step(TOPOLOGY_COMMAND, [...topologyArgs], {
		stdout: `${metadataDbJson([{ branch, children }])}\n`,
	});
}

export function postRestackSubmitCheckSteps(options: {
	branch: string;
	sha: string;
	prNumber: number;
	base: string;
	state?: string;
	isDraft?: boolean;
}): LandStackScriptedExec[] {
	return [
		guardShaStep(options.branch, options.sha),
		step("gh", ["pr", "view", options.branch, "--json", PR_FIELDS], {
			stdout: prStdout(
				prSnapshot({
					number: options.prNumber,
					branch: options.branch,
					base: options.base,
					sha: options.sha,
					...(options.state === undefined ? {} : { state: options.state }),
					...(options.isDraft === undefined ? {} : { isDraft: options.isDraft }),
				}),
			),
		}),
	];
}

export function prSnapshot(overrides: {
	number: number;
	branch: string;
	base: string;
	sha: string;
	title?: string;
	body?: string | null;
	state?: string;
	isDraft?: boolean;
	mergedAt?: string | null;
}): PullRequestSnapshot {
	return {
		number: overrides.number,
		title: overrides.title ?? `PR ${overrides.number}`,
		body: overrides.body === undefined ? `Body for PR ${overrides.number}` : overrides.body,
		state: overrides.state ?? "OPEN",
		isDraft: overrides.isDraft ?? false,
		headRefName: overrides.branch,
		baseRefName: overrides.base,
		headRefOid: overrides.sha,
		mergeStateStatus: "CLEAN",
		url: `https://github.example/pull/${overrides.number}`,
		mergedAt: overrides.mergedAt ?? null,
	};
}

export function prStdout(pr: PullRequestSnapshot): string {
	return `${JSON.stringify(pr)}\n`;
}

export function expectedSquashMergeArgs(options: {
	number: number;
	sha: string;
	title?: string;
	body?: string | null;
}): string[] {
	const title = options.title ?? `PR ${options.number}`;
	const body = options.body === undefined ? `Body for PR ${options.number}` : (options.body ?? "");
	return [
		"pr",
		"merge",
		String(options.number),
		"--squash",
		"--match-head-commit",
		options.sha,
		"--subject",
		title,
		"--body",
		body,
	];
}
