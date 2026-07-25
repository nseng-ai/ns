import { commandSucceeded } from "@nseng-ai/foundation/command";
import type { AutobranchExec } from "./shared.ts";

export const AUTOBRANCH_GIT_TIMEOUT_MS = 30_000;

export const AUTOBRANCH_CLEAN_WORKTREE_LINE = "Working directory is clean.";
export const DIRTY_AUTOBRANCH_WORKTREE_WARNING =
	"Warning: working directory is not clean after checkpoint.";
export const LATEST_COMMIT_AUTOBRANCH_WORKTREE_WARNING =
	"Warning: working directory is not clean after latest-commit autobranch.";

export interface AutobranchCompletionPlan {
	baseSlug: string;
	hasSuffix: boolean;
}

export interface AutobranchCompletionSummary {
	isClean: boolean;
	suffix: string;
	cleanlinessLine: string;
}

export async function summarizeAutobranchCompletion(input: {
	exec: AutobranchExec;
	plan: AutobranchCompletionPlan;
	dirtyWarning: string;
}): Promise<AutobranchCompletionSummary> {
	const cleanliness = await input.exec(
		"git",
		["status", "--porcelain=v1"],
		AUTOBRANCH_GIT_TIMEOUT_MS,
	);
	const isClean = commandSucceeded(cleanliness) && cleanliness.stdout.trim().length === 0;
	const suffix = input.plan.hasSuffix ? ` (base slug ${input.plan.baseSlug} was unavailable)` : "";
	return {
		isClean,
		suffix,
		cleanlinessLine: isClean ? AUTOBRANCH_CLEAN_WORKTREE_LINE : input.dirtyWarning,
	};
}
