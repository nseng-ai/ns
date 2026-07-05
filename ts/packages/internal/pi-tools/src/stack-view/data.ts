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
 * (stack-gateway, repo identity, or the batched PR query). Per-branch objective
 * lookups degrade to empty slugs on failure rather than failing the whole load,
 * because objective attribution is display-only metadata.
 */
import { isAbsolute, resolve } from "node:path";

import type { CommandExecApi, StackViewExecContext } from "./exec.ts";
import {
	deriveStatus,
	type StackViewModel,
	type StackViewPr,
	type StackViewPrStatus,
} from "./types.ts";
import { fetchRepoIdentity, fetchStackPrs, graphiteUrl, type StackPrData } from "./graphql.ts";
import type { GithubRepositoryIdentity } from "@ns/capability-kit/github";
import { objectiveSlugsForBranch } from "./objectives.ts";
import {
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
	type GraphiteStackGitGateway,
	type StackInfo,
} from "@nseng-ai/capability-kit/graphite/stack";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { commandSucceeded } from "@nseng-ai/foundation/exec";

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

/** Outcome of the repo-identity → batched-PR-query chain (identity must precede the query). */
type IdentityAndPrsResult =
	| { type: "ok"; repoIdentity: GithubRepositoryIdentity; prs: (StackPrData | null)[] }
	| { type: "error"; message: string };

/**
 * Load the current Graphite stack and everything the `/stack:view` panel needs.
 *
 * Steps: (1) LBYL-check the current branch and read the stack, mapping
 * detached / untracked / on-trunk to `not-on-stack`; (2) order the branches
 * top-of-stack first, nearest-trunk last, with trunk carried separately; (3)
 * fetch repo identity → batched PR data (sequential, the query needs owner/repo)
 * concurrently with per-branch objective diffs; (4) join into a
 * {@link StackViewModel}.
 */
export async function loadStackView(params: LoadStackViewParams): Promise<LoadStackViewResult> {
	const { execApi, cwd } = params;
	const git = stackViewGitGateway(execApi);

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

	const orderedBranches = orderStackBranches(stack);
	const parentBranches = orderedBranches.map(
		(_branch, index) => orderedBranches[index + 1] ?? stack.trunk,
	);

	// The identity→PR chain must be sequential (the query needs owner/repo), but
	// the per-branch objective diffs are independent and run alongside it.
	const [identityAndPrs, objectiveSlugsByRow] = await Promise.all([
		loadIdentityAndPrs({ execApi, cwd }, orderedBranches),
		Promise.all(
			orderedBranches.map(async (branch, index) => {
				const parentBranch = parentBranches[index] ?? stack.trunk;
				const result = await objectiveSlugsForBranch({ execApi, cwd, branch, parentBranch });
				// A single branch's objective diff failing must not fail the whole
				// load: objective attribution is display-only metadata, so degrade
				// this row to no slugs and keep going.
				return result.type === "ok" ? result.slugs : [];
			}),
		),
	]);

	if (identityAndPrs.type === "error") return { type: "error", message: identityAndPrs.message };

	const { repoIdentity, prs } = identityAndPrs;
	const rows = orderedBranches.map((branch, index) =>
		buildStackViewPr({
			branch,
			parentBranch: parentBranches[index] ?? stack.trunk,
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

/**
 * Resolve repo identity, then run the batched PR query against it. Sequential by
 * necessity (the query is parameterized by owner/repo); any failure in either
 * step becomes a whole-load `error` with the failing step named.
 */
async function loadIdentityAndPrs(
	context: StackViewExecContext,
	branches: string[],
): Promise<IdentityAndPrsResult> {
	const identity = await fetchRepoIdentity(context);
	if (identity.type !== "ok") return { type: "error", message: repoIdentityErrorMessage(identity) };

	const stackPrs = await fetchStackPrs({
		...context,
		branches,
		repoIdentity: identity.repoIdentity,
	});
	if (stackPrs.type !== "ok") return { type: "error", message: stackPrsErrorMessage(stackPrs) };

	return { type: "ok", repoIdentity: identity.repoIdentity, prs: stackPrs.prs };
}

interface CommonFetchFailure {
	type: "exec-error" | "invalid-json" | "schema-mismatch";
	message?: string;
}

function commonFetchErrorMessage(
	failure: CommonFetchFailure,
	messages: {
		execPrefix: string;
		invalidJsonPrefix: string;
		schemaMismatch: string;
	},
): string {
	switch (failure.type) {
		case "exec-error":
			return `${messages.execPrefix}: ${failure.message ?? "unknown error"}`;
		case "invalid-json":
			return `${messages.invalidJsonPrefix}: ${failure.message ?? "unknown error"}`;
		case "schema-mismatch":
			return messages.schemaMismatch;
	}
}

function repoIdentityErrorMessage(
	identity: Exclude<Awaited<ReturnType<typeof fetchRepoIdentity>>, { type: "ok" }>,
): string {
	return commonFetchErrorMessage(identity, {
		execPrefix: "Could not identify the GitHub repository",
		invalidJsonPrefix: "GitHub repository identity was not valid JSON",
		schemaMismatch: "GitHub returned an unexpected shape for the repository identity",
	});
}

function stackPrsErrorMessage(
	stackPrs: Exclude<Awaited<ReturnType<typeof fetchStackPrs>>, { type: "ok" }>,
): string {
	if (stackPrs.type === "graphql-errors") {
		return `GitHub returned GraphQL errors for the stack pull-request query: ${stackPrs.messages.join("; ")}`;
	}
	return commonFetchErrorMessage(stackPrs, {
		execPrefix: "Could not query stack pull requests",
		invalidJsonPrefix: "Stack pull-request response was not valid JSON",
		schemaMismatch: "GitHub returned an unexpected shape for the stack pull-request query",
	});
}

interface BuildStackViewPrParams {
	branch: string;
	parentBranch: string;
	prData: StackPrData | null;
	objectiveSlugs: string[];
	repoIdentity: GithubRepositoryIdentity;
}

/** Build a single stack row, degrading to a `no-pr` row when the branch has no open PR. */
function buildStackViewPr(params: BuildStackViewPrParams): StackViewPr {
	const { branch, parentBranch, prData, objectiveSlugs, repoIdentity } = params;
	if (prData === null) {
		return {
			branch,
			parentBranch,
			number: null,
			title: "",
			url: "",
			graphiteUrl: "",
			isDraft: false,
			body: "",
			threads: { resolved: 0, total: 0 },
			checks: { passing: 0, failing: 0, pending: 0, total: 0 },
			checkEntries: [],
			unresolvedThreads: [],
			status: noPrStatus(),
			objectiveSlugs,
		};
	}
	return {
		branch,
		parentBranch,
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
 * `getGitCommonDir` runs `git rev-parse --git-common-dir` and resolves the
 * (possibly relative) result against `cwd`, mirroring the slot repository gateway.
 */
function stackViewGitGateway(execApi: CommandExecApi): GraphiteStackGitGateway {
	const coreGit = new RealGitGateway(execApi);
	return {
		async getGitCommonDir(cwd: string): Promise<string | null> {
			const result = await execApi.exec("git", ["rev-parse", "--git-common-dir"], { cwd });
			if (!commandSucceeded(result)) return null;
			const raw = result.stdout.trim();
			if (raw.length === 0) return null;
			return isAbsolute(raw) ? raw : resolve(cwd, raw);
		},
		async getCurrentBranch(cwd: string) {
			const result = await coreGit.currentBranch({ cwd });
			if (result.type === "branch") return { type: "branch", branch: result.branch };
			if (result.type === "detached") return { type: "detached" };
			return { type: "failure", failure: { message: result.error.message } };
		},
	};
}
