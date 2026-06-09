import type { PlansGitGateway } from "@asdl/plans";

import type { PlannedBranchGitGateway } from "./git-gateway.ts";

export function adaptPlannedBranchGitGateway(git: PlannedBranchGitGateway | undefined): PlansGitGateway | undefined {
	if (git === undefined) return undefined;
	return {
		repoRoot: (params) => git.repoRoot(params),
		optionalRepoRoot: (params) => git.optionalRepoRoot(params),
		currentBranch: (params) => git.sourceBranch(params),
		originUrl: (params) => git.originUrl(params),
	};
}
