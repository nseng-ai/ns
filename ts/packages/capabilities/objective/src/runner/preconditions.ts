import { failure, negative, usageError, type ClinkrExit } from "@nseng-ai/clinkr";

import { activeRecordRelativePath, isValidObjectiveSlug } from "../core/storage.ts";
import type { ObjectiveRunnerCoreContext, RunnerStepMode } from "./context.ts";

export interface RunnerPreconditionFacts {
	objectivePath: string;
	/** Branch the step dispatches from; the recover branch in recover mode. */
	baseBranch: string;
	headAtDispatch: string;
	/** Live changed paths at dispatch (empty in default mode by construction). */
	changedPaths: readonly string[];
}

export type RunnerPreconditionsResult =
	| { type: "ok"; facts: RunnerPreconditionFacts }
	/** Malformed request (bad slug, unknown Objective) → clinkr usageError. */
	| { type: "usage-error"; message: string }
	/** Repository state refuses this mode (LBYL) → clinkr negative. */
	| { type: "refused"; message: string }
	/** Infrastructure failed before the step could start → clinkr failure. */
	| { type: "failure"; code: string; message: string };

export interface CheckRunnerPreconditionsOptions {
	slug: string;
	mode: RunnerStepMode;
}

export interface ResolveRunnerStepIdentityOptions {
	slug?: string;
	recover: boolean;
}

export type ResolveRunnerStepIdentityResult =
	| { type: "ok"; slug: string; mode: RunnerStepMode }
	| { type: "usage-error"; message: string; argument: "slug" };

export function resolveRunnerStepIdentity(
	options: ResolveRunnerStepIdentityOptions,
): ResolveRunnerStepIdentityResult {
	if (options.slug === undefined) {
		return { type: "usage-error", message: "Objective slug is required.", argument: "slug" };
	}
	return { type: "ok", slug: options.slug, mode: options.recover ? "recover" : "default" };
}

export function runnerPreconditionProblemExit<T>(
	problem: Exclude<RunnerPreconditionsResult, { type: "ok" }>,
): ClinkrExit<T> {
	if (problem.type === "usage-error") return usageError(problem.message, { argument: "slug" });
	if (problem.type === "refused") return negative(problem.message);
	return failure(problem.code, problem.message);
}

/**
 * LBYL preconditions for one runner step. Default mode requires an open
 * Objective, a clean worktree, and a named branch; recover mode inverts the
 * worktree requirement (dirty, on a non-trunk branch left by a failed step).
 */
export async function checkRunnerPreconditions(
	ctx: ObjectiveRunnerCoreContext,
	options: CheckRunnerPreconditionsOptions,
): Promise<RunnerPreconditionsResult> {
	const { slug, mode } = options;
	if (!isValidObjectiveSlug(slug)) {
		return { type: "usage-error", message: `Invalid Objective slug: ${JSON.stringify(slug)}.` };
	}
	const objectivePath = activeRecordRelativePath(slug);

	const exists = await ctx.storage.activeRecordExists(slug);
	if (!exists.ok)
		return { type: "failure", code: exists.error.code, message: exists.error.message };
	if (!exists.value) {
		return {
			type: "usage-error",
			message: `No Objective record found for slug ${JSON.stringify(slug)}.`,
		};
	}
	const files = await ctx.storage.activeRecordFilePresence(slug);
	if (!files.ok) return { type: "failure", code: files.error.code, message: files.error.message };
	if (files.value.closedMd) {
		return { type: "refused", message: `Objective ${JSON.stringify(slug)} is closed.` };
	}

	const currentBranch = await ctx.git.currentBranch({ cwd: ctx.repoRoot });
	if (currentBranch.type === "failure") {
		return {
			type: "failure",
			code: currentBranch.error.code,
			message: currentBranch.error.message,
		};
	}
	if (currentBranch.type === "detached") {
		return { type: "refused", message: "Refusing to run a step from a detached HEAD." };
	}
	const baseBranch = currentBranch.branch;

	const status = await ctx.git.statusPaths({ cwd: ctx.repoRoot });
	if (!status.ok)
		return { type: "failure", code: status.error.code, message: status.error.message };
	const changedPaths = status.value.changedPaths;

	if (mode === "default" && changedPaths.length > 0) {
		return {
			type: "refused",
			message: `Worktree is dirty (${changedPaths.length} changed path(s)); a default-mode step requires a clean worktree. Use --recover to repair a failed attempt.`,
		};
	}
	if (mode === "recover") {
		if (changedPaths.length === 0) {
			return {
				type: "refused",
				message: "Worktree is clean; --recover requires the dirty tree a failed step left behind.",
			};
		}
		if (baseBranch === ctx.trunkBranch) {
			return {
				type: "refused",
				message: `Refusing to recover on trunk branch ${JSON.stringify(ctx.trunkBranch)}; --recover expects the failed attempt's non-trunk branch.`,
			};
		}
	}

	const head = await ctx.git.headCommit({ cwd: ctx.repoRoot });
	if (!head.ok) return { type: "failure", code: head.error.code, message: head.error.message };

	return {
		type: "ok",
		facts: { objectivePath, baseBranch, headAtDispatch: head.value, changedPaths },
	};
}
