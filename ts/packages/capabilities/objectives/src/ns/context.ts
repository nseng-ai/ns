import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { RealObjectiveStorageGateway } from "../core/real-storage.ts";
import { ObjectiveStorage } from "../core/storage.ts";
import type { ObjectiveCliContext } from "../core/context.ts";

/** Gateway substitutions for derived contexts (runner overrides, tests). */
export interface CreateNsObjectiveContextOptions {
	git?: GitGateway;
	storage?: ObjectiveStorage;
}

export async function createNsObjectiveContext(
	ctx: NsExtensionApi,
	options: CreateNsObjectiveContextOptions = {},
): Promise<ObjectiveCliContext> {
	const git = options.git ?? createNsGitGateway(ctx);
	const repoRootResult = await git.optionalRepoRoot({ cwd: ctx.cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : ctx.cwd;
	const trunkBranchResult = await git.trunkBranch({ cwd: repoRoot });
	const trunkBranch = trunkBranchResult.type === "found" ? trunkBranchResult.value : "main";
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		repoRoot,
		trunkBranch,
		storage: options.storage ?? new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}
