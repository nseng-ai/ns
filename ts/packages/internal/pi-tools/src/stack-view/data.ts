/**
 * The orchestration layer for the `/stack:view` panel. `loadStackView` is the
 * single entry point: it reads the current Graphite stack, fetches per-branch PR
 * data and objective attribution through the injected exec seam, and joins
 * everything into the pure {@link StackViewModel} the render layer consumes.
 *
 * Error model matches the rest of stack-view (`graphql.ts`, `objectives.ts`):
 * failures are returned as typed discriminated-union values, never thrown.
 * `not-on-stack` is the LBYL "nothing to show" outcome (detached HEAD, an
 * untracked branch, or sitting on the trunk); `error` covers genuine failures
 * (stack-gateway, repo identity, or the batched PR query). Repo identity is
 * resolved locally from the `origin` remote URL (no network round-trip).
 * Per-branch objective lookups degrade to empty slugs on failure rather than
 * failing the whole load, because objective attribution is display-only metadata.
 */
import type { CommandExecApi, StackViewExecContext } from "./exec.ts";
import {
	deriveStatus,
	type StackBranchLineage,
	type StackViewModel,
	type StackViewPr,
	type StackViewPrStatus,
} from "./types.ts";
import {
	fetchStackPrs,
	graphiteUrl,
	type FetchStackPrsResult,
	type StackPrData,
} from "./graphql.ts";
import {
	resolveGithubRepositoryIdentityFromOrigin,
	type GithubRepositoryIdentity,
} from "@nseng-ai/capability-kit/github";
import { objectiveSlugsForBranch } from "./objectives.ts";
import {
	execGitCommonDir,
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
	type GraphiteStackGitGateway,
	type StackInfo,
} from "@nseng-ai/capability-kit/graphite/stack";
import { RealGitGateway, type GitGateway } from "@nseng-ai/capability-kit/git";

export interface LoadStackViewParams extends StackViewExecContext {
	/**
	 * Test seam. The default `RealGraphiteStackGateway` reads Graphite's sqlite
	 * metadata db through filesystem/sqlite access that does NOT route through
	 * `execApi`, so fake-driven tests inject an in-memory gateway here instead.
	 */
	stackGateway?: GraphiteStackGateway;
}

/**
 * Result of {@link loadStackView}.
 * - `ok`: a fully joined model ready to render.
 * - `not-on-stack`: a friendly "nothing to show" reason (detached / untracked /
 *   on trunk) surfaced to the user via `ctx.ui.notify`.
 * - `error`: an actionable failure message naming the step that failed.
 */
export type LoadStackViewResult =
	| { type: "ok"; model: StackViewModel }
	| { type: "not-on-stack"; reason: string }
	| { type: "error"; message: string };

/**
 * Load the current Graphite stack and everything the `/stack:view` panel needs.
 *
 * Steps: (1) LBYL-check the current branch and read the stack, mapping
 * detached / untracked / on-trunk to `not-on-stack`; (2) order the branches
 * top-of-stack first, nearest-trunk last, with trunk carried separately; (3)
 * resolve the repo identity locally from the `origin` remote, then fetch the
 * batched PR data concurrently with the per-branch objective diffs; (4) join
 * into a {@link StackViewModel}.
 */
export async function loadStackView(params: LoadStackViewParams): Promise<LoadStackViewResult> {
	const { execApi, cwd } = params;
	const coreGit = new RealGitGateway(execApi);
	const git = stackViewGitGateway(execApi, coreGit);

	// LBYL: detect detached HEAD cleanly here rather than string-matching the
	// stack gateway's failure message (it reports detached HEAD as a `failure`).
	const current = await git.getCurrentBranch(cwd);
	if (current.type === "detached")
		return {
			type: "not-on-stack",
			reason: "HEAD is detached; check out a branch to view its stack.",
		};
	if (current.type === "failure")
		return {
			type: "error",
			message: `Could not resolve the current branch: ${current.failure.message}`,
		};

	const gt = params.stackGateway ?? new RealGraphiteStackGateway({ git, execApi });
	const stackResult = await gt.stack(cwd);
	if (stackResult.type === "untracked_branch")
		return {
			type: "not-on-stack",
			reason: `Branch '${current.branch}' is not tracked by Graphite; run 'gt track' to add it to a stack.`,
		};
	if (stackResult.type === "failure")
		return {
			type: "error",
			message: `Could not read the Graphite stack: ${stackResult.failure.message}`,
		};

	const stack = stackResult.stack;
	if (stack.current === stack.trunk)
		return {
			type: "not-on-stack",
			reason: `You're on the trunk branch '${stack.trunk}'; check out a stacked branch to view its stack.`,
		};

	// Zip each branch with its parent once (nearest-trunk row's parent is the
	// trunk itself), so the `?? stack.trunk` fallback is applied a single time.
	const orderedBranches = orderStackBranches(stack);
	const lineages: StackBranchLineage[] = orderedBranches.map((branch, index) => ({
		branch,
		parentBranch: orderedBranches[index + 1] ?? stack.trunk,
	}));

	// Resolve the repo identity locally (fast git call) before the concurrent
	// fetch; a missing/invalid `origin` remote is a whole-load error.
	const identity = await resolveRepoIdentity(coreGit, cwd);
	if (identity.type === "error") return { type: "error", message: identity.message };
	const repoIdentity = identity.repoIdentity;

	// The batched PR query and the per-branch objective diffs are independent, so
	// run them concurrently.
	const [stackPrs, objectiveSlugsByRow] = await Promise.all([
		fetchStackPrs({ execApi, cwd, branches: orderedBranches, repoIdentity }),
		Promise.all(
			lineages.map(async (lineage) => {
				const result = await objectiveSlugsForBranch({ execApi, cwd, lineage });
				// A single branch's objective diff failing must not fail the whole
				// load: objective attribution is display-only metadata, so degrade
				// this row to no slugs and keep going.
				return result.type === "ok" ? result.slugs : [];
			}),
		),
	]);

	if (stackPrs.type !== "ok") return { type: "error", message: stackPrsErrorMessage(stackPrs) };

	const prs = stackPrs.prs;
	const rows = lineages.map((lineage, index) =>
		buildStackViewPr({
			lineage,
			prData: prs[index] ?? null,
			objectiveSlugs: objectiveSlugsByRow[index] ?? [],
			repoIdentity,
		}),
	);

	return {
		type: "ok",
		model: {
			trunk: stack.trunk,
			currentBranch: stack.current,
			prs: rows,
			...repoIdentity,
			objectivesBySlug: buildObjectivesBySlug(rows),
		},
	};
}

/**
 * Order the stack's branches into render rows: top-of-stack first, nearest-trunk
 * last, with the trunk excluded (it is carried separately on the model).
 *
 * `descendants` from the gateway are nearest-child first, so reversing them puts
 * the top of the stack first. `ancestors` are trunk-first (`ancestors[0]` is the
 * trunk), so dropping the trunk and reversing yields parent-of-current first
 * down to the branch just above the trunk.
 */
function orderStackBranches(stack: StackInfo): string[] {
	const descendantRows = [...stack.descendants].reverse();
	const ancestorRows = stack.ancestors.filter((branch) => branch !== stack.trunk).reverse();
	return [...descendantRows, stack.current, ...ancestorRows];
}

/** Outcome of resolving the repo's `owner`/`repo` identity from the `origin` remote URL. */
type ResolveRepoIdentityResult =
	| { type: "ok"; repoIdentity: GithubRepositoryIdentity }
	| { type: "error"; message: string };

/**
 * Resolve the repo's GitHub identity from the local `origin` remote URL (no
 * network round-trip). A missing/`error`/unparseable remote becomes a whole-load
 * `error`; the underlying git error message is included when the gateway carries
 * one.
 */
async function resolveRepoIdentity(
	git: GitGateway,
	cwd: string,
): Promise<ResolveRepoIdentityResult> {
	const identity = await resolveGithubRepositoryIdentityFromOrigin(git, { cwd });
	if (identity.type === "found") return { type: "ok", repoIdentity: identity.value };
	if (identity.type === "error") {
		return {
			type: "error",
			message: `Could not determine the GitHub repository from the origin remote: ${identity.error.message}`,
		};
	}
	if (identity.type === "unparseable") {
		return {
			type: "error",
			message:
				"Could not determine the GitHub repository from the origin remote: its URL is not a GitHub repository URL.",
		};
	}
	return {
		type: "error",
		message:
			"Could not determine the GitHub repository from the origin remote: no 'origin' remote is configured.",
	};
}

function stackPrsErrorMessage(stackPrs: Exclude<FetchStackPrsResult, { type: "ok" }>): string {
	switch (stackPrs.type) {
		case "exec-error":
			return `Could not query stack pull requests: ${stackPrs.message}`;
		case "invalid-json":
			return `Stack pull-request response was not valid JSON: ${stackPrs.message}`;
		case "graphql-errors":
			return `GitHub returned GraphQL errors for the stack pull-request query: ${stackPrs.messages.join("; ")}`;
		case "schema-mismatch":
			return "GitHub returned an unexpected shape for the stack pull-request query";
	}
}

interface BuildStackViewPrParams {
	lineage: StackBranchLineage;
	prData: StackPrData | null;
	objectiveSlugs: string[];
	repoIdentity: GithubRepositoryIdentity;
}

/** Build a single stack row, degrading to a `no-pr` row when the branch has no open PR. */
function buildStackViewPr(params: BuildStackViewPrParams): StackViewPr {
	const { lineage, prData, objectiveSlugs, repoIdentity } = params;
	if (prData === null) {
		return {
			branch: lineage.branch,
			parentBranch: lineage.parentBranch,
			number: null,
			title: "",
			url: "",
			graphiteUrl: "",
			isDraft: false,
			body: "",
			threads: { resolved: 0, total: 0 },
			checks: { passing: 0, failing: 0, pending: 0, cancelled: 0, total: 0 },
			checkEntries: [],
			unresolvedThreads: [],
			status: noPrStatus(),
			objectiveSlugs,
		};
	}
	return {
		branch: lineage.branch,
		parentBranch: lineage.parentBranch,
		number: prData.number,
		title: prData.title,
		url: prData.url,
		graphiteUrl: graphiteUrl(repoIdentity, prData.number),
		isDraft: prData.isDraft,
		body: prData.body,
		threads: prData.threads,
		checks: prData.checks,
		checkEntries: prData.checkEntries,
		unresolvedThreads: prData.unresolvedThreads,
		status: deriveStatus({
			number: prData.number,
			isDraft: prData.isDraft,
			checks: prData.checks,
			threads: prData.threads,
		}),
		objectiveSlugs,
	};
}

function noPrStatus(): StackViewPrStatus {
	return deriveStatus({
		number: null,
		isDraft: false,
		checks: { failing: 0 },
		threads: { resolved: 0, total: 0 },
	});
}

/**
 * Build the slug → PR-numbers index in row order (top-of-stack first). Only rows
 * that actually have a PR contribute a number; a `no-pr` row that edits an
 * objective still carries its slugs on the row, but has no PR number to add here,
 * so it is skipped from this map.
 */
function buildObjectivesBySlug(rows: readonly StackViewPr[]): Map<string, number[]> {
	const bySlug = new Map<string, number[]>();
	for (const row of rows) {
		if (row.number === null) continue;
		for (const slug of row.objectiveSlugs) {
			const existing = bySlug.get(slug);
			if (existing === undefined) bySlug.set(slug, [row.number]);
			else existing.push(row.number);
		}
	}
	return bySlug;
}

/**
 * Adapt the injected `execApi` into the two-method `GraphiteStackGitGateway` the
 * stack gateway needs. `currentBranch` reuses the tested `RealGitGateway`;
 * `getGitCommonDir` delegates to the shared {@link execGitCommonDir} helper.
 */
function stackViewGitGateway(
	execApi: CommandExecApi,
	coreGit: GitGateway,
): GraphiteStackGitGateway {
	return {
		getGitCommonDir(cwd: string): Promise<string | null> {
			return execGitCommonDir(execApi, cwd);
		},
		async getCurrentBranch(cwd: string) {
			const result = await coreGit.currentBranch({ cwd });
			if (result.type === "branch") return { type: "branch", branch: result.branch };
			if (result.type === "detached") return { type: "detached" };
			return { type: "failure", failure: { message: result.error.message } };
		},
	};
}
