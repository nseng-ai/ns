import type { CommandResult } from "@asdl/sdl/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "@asdl/sdl/pending-worktree";

import { chooseAvailableBranchName } from "./branch-name.ts";
import {
	buildBranchSlugPrompt,
	deriveBranchSlug,
	MAX_DIFF_CHARS,
	prepareRequestedBranchSlug,
} from "./slug.ts";
import { formatCommandDetails } from "./shared.ts";
import { inspectUpstreamHeadState } from "./upstream.ts";
import type { ParsedAutobranchArgs } from "./preparation.ts";
import { shortSha } from "./short-sha.ts";

const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;

export interface LatestCommitPreparationInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
}

interface LatestCommitFacts {
	sourceBranch: string;
	trunkBranch: string;
	originalHeadSha: string;
	parentSha: string;
	commitMessage: string;
	commitDiff: string;
	commitSummary: string;
	upstream?: string;
}

export interface LatestCommitAutobranchPlan extends LatestCommitFacts {
	branchName: string;
	baseSlug: string;
	hasSuffix: boolean;
	slugSource: "requested" | "model";
}

export type LatestCommitPreparationResult =
	| { ok: true; plan: LatestCommitAutobranchPlan }
	| { ok: false; kind: "trunk_lookup_failed"; error: string }
	| { ok: false; kind: "trunk_refusal"; branch: string }
	| { ok: false; kind: "upstream_check_failed"; error: string }
	| { ok: false; kind: "pushed_head_refusal"; upstream: string }
	| { ok: false; kind: "child_branch_check_failed"; error: string }
	| { ok: false; kind: "child_branch_refusal"; children: string[] }
	| { ok: false; kind: "commit_parent_lookup_failed"; error: string }
	| { ok: false; kind: "root_commit_refusal"; headSha: string }
	| { ok: false; kind: "merge_commit_refusal"; headSha: string; parentCount: number }
	| { ok: false; kind: "commit_evidence_failed"; error: string }
	| { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
	| { ok: false; kind: "slug_generation_failed"; error: string }
	| { ok: false; kind: "branch_name_unavailable"; baseSlug: string };

type LatestCommitFactsFailure = Extract<
	LatestCommitPreparationResult,
	{
		kind:
			| "trunk_lookup_failed"
			| "trunk_refusal"
			| "upstream_check_failed"
			| "pushed_head_refusal"
			| "child_branch_check_failed"
			| "child_branch_refusal"
			| "commit_parent_lookup_failed"
			| "root_commit_refusal"
			| "merge_commit_refusal"
			| "commit_evidence_failed";
	}
>;

export type LatestCommitFactsResult =
	| { ok: true; facts: LatestCommitFacts }
	| LatestCommitFactsFailure;

type PreparedLatestCommitSlugResult =
	| { ok: true; baseSlug: string; source: LatestCommitAutobranchPlan["slugSource"] }
	| Extract<LatestCommitPreparationResult, { kind: "slug_generation_failed" }>;

export async function prepareLatestCommitAutobranchPlan(
	input: LatestCommitPreparationInput,
): Promise<LatestCommitPreparationResult> {
	const requested = prepareRequestedBranchSlug(input.args.slug);
	if (requested.kind === "invalid_requested_slug") {
		return { ok: false, kind: "invalid_requested_slug", requestedSlug: requested.requestedSlug };
	}

	const facts = await loadLatestCommitFacts(input);
	if (!facts.ok) {
		return facts;
	}

	const slug =
		requested.kind === "slug"
			? { ok: true as const, baseSlug: requested.baseSlug, source: requested.source }
			: await prepareLatestCommitSlug(input, facts.facts);
	if (!slug.ok) {
		return slug;
	}

	const branchName = await chooseAvailableBranchName(input, slug.baseSlug);
	if (!branchName.ok) {
		return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
	}

	return {
		ok: true,
		plan: {
			...facts.facts,
			branchName: branchName.name,
			baseSlug: slug.baseSlug,
			hasSuffix: branchName.hasSuffix,
			slugSource: slug.source,
		},
	};
}

export async function loadLatestCommitFacts(
	input: Pick<LatestCommitPreparationInput, "cwd" | "exec" | "snapshot">,
): Promise<LatestCommitFactsResult> {
	const trunk = await input.exec("gt", ["trunk", "--no-interactive"], input.cwd, GT_TIMEOUT_MS);
	if (trunk.code !== 0) {
		return { ok: false, kind: "trunk_lookup_failed", error: formatCommandDetails(trunk) };
	}
	const trunkBranch = trunk.stdout
		.trim()
		.split("\n")
		.find((line) => line.trim().length > 0)
		?.trim();
	if (!trunkBranch) {
		return { ok: false, kind: "trunk_lookup_failed", error: "gt trunk returned no branch name." };
	}
	if (input.snapshot.branch === trunkBranch) {
		return { ok: false, kind: "trunk_refusal", branch: input.snapshot.branch };
	}

	const upstream = await inspectUpstreamHeadState(input);
	if (upstream.type === "failed") {
		return { ok: false, kind: "upstream_check_failed", error: upstream.error };
	}
	if (upstream.type === "upstream_contains_head") {
		return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
	}

	const children = await inspectGraphiteChildBranches(input);
	if (!children.ok) {
		return { ok: false, kind: "child_branch_check_failed", error: children.error };
	}
	if (children.children.length > 0) {
		return { ok: false, kind: "child_branch_refusal", children: children.children };
	}

	const parents = await input.exec(
		"git",
		["rev-list", "--parents", "-n", "1", "HEAD"],
		input.cwd,
		GIT_TIMEOUT_MS,
	);
	if (parents.code !== 0) {
		return { ok: false, kind: "commit_parent_lookup_failed", error: formatCommandDetails(parents) };
	}
	const [headSha, ...parentShas] = parents.stdout.trim().split(/\s+/).filter(Boolean);
	if (!headSha) {
		return {
			ok: false,
			kind: "commit_parent_lookup_failed",
			error: "git rev-list returned no HEAD commit.",
		};
	}
	if (parentShas.length === 0) {
		return { ok: false, kind: "root_commit_refusal", headSha };
	}
	if (parentShas.length > 1) {
		return { ok: false, kind: "merge_commit_refusal", headSha, parentCount: parentShas.length };
	}

	const [message, diff] = await Promise.all([
		input.exec("git", ["log", "-1", "--format=%B"], input.cwd, GIT_TIMEOUT_MS),
		input.exec("git", ["diff", "HEAD^", "HEAD", "--no-ext-diff"], input.cwd, GIT_TIMEOUT_MS),
	]);
	if (message.code !== 0) {
		return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(message) };
	}
	if (diff.code !== 0) {
		return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(diff) };
	}
	const commitSubject = message.stdout.split("\n")[0]?.trim();
	const commitSummary = commitSubject ? `${shortSha(headSha)} ${commitSubject}` : shortSha(headSha);

	return {
		ok: true,
		facts: {
			sourceBranch: input.snapshot.branch,
			trunkBranch,
			originalHeadSha: headSha,
			parentSha: parentShas[0] as string,
			commitMessage: message.stdout,
			commitDiff: diff.stdout,
			commitSummary,
			...(upstream.type === "head_not_in_upstream" ? { upstream: upstream.upstream } : {}),
		},
	};
}

async function inspectGraphiteChildBranches(
	input: Pick<LatestCommitPreparationInput, "cwd" | "exec">,
): Promise<{ ok: true; children: string[] } | { ok: false; error: string }> {
	const children = await input.exec(
		"gt",
		["children", "--no-interactive"],
		input.cwd,
		GT_TIMEOUT_MS,
	);
	if (children.code !== 0) {
		return { ok: false, error: formatCommandDetails(children) };
	}
	return { ok: true, children: nonEmptyLines(children.stdout) };
}

function nonEmptyLines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

async function prepareLatestCommitSlug(
	input: Pick<LatestCommitPreparationInput, "cwd" | "exec">,
	facts: LatestCommitFacts,
): Promise<PreparedLatestCommitSlugResult> {
	const result = await deriveBranchSlug({
		cwd: input.cwd,
		prompt: buildLatestCommitSlugPrompt(facts),
		exec: input.exec,
	});
	if (result.ok) {
		return { ok: true, baseSlug: result.baseSlug, source: result.source };
	}
	return {
		ok: false,
		kind: "slug_generation_failed",
		error: `Could not derive a branch slug for the latest commit. Rerun with --slug <name>.\n${result.formattedFailure}`,
	};
}

function buildLatestCommitSlugPrompt(facts: LatestCommitFacts): string {
	return buildBranchSlugPrompt({
		intro: "Generate a concise git branch slug for the latest commit below.",
		inference: "Infer the actual code, docs, or product change from the commit and diff contents.",
		evidenceSections: [
			{
				heading: "commit message",
				content: facts.commitMessage,
				emptyText: "(empty commit message)",
			},
			{
				heading: "git diff HEAD^ HEAD",
				content: facts.commitDiff,
				emptyText: "(no diff)",
				maxChars: MAX_DIFF_CHARS,
			},
		],
	});
}
