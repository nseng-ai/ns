import type { GitErrorInfo } from "@nseng-ai/foundation/git";
import {
	validateRepositoryTrunkReadiness,
	type RepositoryTrunk,
} from "@nseng-ai/extension-kit/repository-trunk";

import type { ObjectiveCliContext } from "./context.ts";

export type ObjectiveLocalTrunkReadinessResult =
	| { type: "ready"; trunk: RepositoryTrunk }
	| { type: "git-error"; error: GitErrorInfo };

/** Establishes the local-trunk precondition immediately before an Objective operation dereferences it. */
export async function requireObjectiveContextLocalTrunk(
	ctx: Pick<ObjectiveCliContext, "repoRoot" | "git" | "repositoryTrunk">,
): Promise<ObjectiveLocalTrunkReadinessResult> {
	const readiness = await validateRepositoryTrunkReadiness({
		repoRoot: ctx.repoRoot,
		git: ctx.git,
		trunk: ctx.repositoryTrunk,
		requiredRefs: ["local"],
	});
	if (!readiness.ok) return { type: "git-error", error: readiness.error };
	return { type: "ready", trunk: readiness.value };
}
