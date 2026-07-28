import type { GitErrorInfo, GitGateway } from "@nseng-ai/foundation/git";

import type { ObjectiveCliContext } from "./context.ts";

export type ObjectiveLocalTrunkReadinessResult =
	| { type: "ready"; branch: string; localRef: string }
	| { type: "git-error"; error: GitErrorInfo };

interface ObjectiveLocalTrunkIdentity {
	repoRoot: string;
	branch: string;
	git: Pick<GitGateway, "exactRefPresence">;
}

/** Establishes the local-trunk precondition immediately before an Objective operation dereferences it. */
export async function requireObjectiveLocalTrunk(
	identity: ObjectiveLocalTrunkIdentity,
): Promise<ObjectiveLocalTrunkReadinessResult> {
	const localRef = `refs/heads/${identity.branch}`;
	const presence = await identity.git.exactRefPresence({ cwd: identity.repoRoot, ref: localRef });
	if (presence.type === "present") return { type: "ready", branch: identity.branch, localRef };
	if (presence.type === "error") return { type: "git-error", error: presence.error };
	return {
		type: "git-error",
		error: {
			code: "local-branch-missing",
			message: `Repository trunk local ref \`${localRef}\` is missing. Create a local branch \`${identity.branch}\` after fetching the repository trunk if needed.`,
		},
	};
}

export async function requireObjectiveContextLocalTrunk(
	ctx: Pick<ObjectiveCliContext, "repoRoot" | "git" | "trunkBranch">,
): Promise<ObjectiveLocalTrunkReadinessResult> {
	return await requireObjectiveLocalTrunk({
		repoRoot: ctx.repoRoot,
		git: ctx.git,
		branch: ctx.trunkBranch,
	});
}
