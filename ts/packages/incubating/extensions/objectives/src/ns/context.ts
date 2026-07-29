import { createNsGitGateway, NsCommandExecApi } from "@nseng-ai/extension-kit";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { RealObjectiveOwnerGateway, type ObjectiveOwnerGateway } from "../core/owner-gateway.ts";
import { RealObjectiveStorageGateway } from "../core/real-storage.ts";
import { ObjectiveStorage } from "../core/storage.ts";
import type { ObjectiveCliContext } from "../core/context.ts";

/** Gateway substitutions for derived contexts (runner overrides, tests). */
export interface CreateNsObjectiveContextOptions {
	git?: GitGateway;
	storage?: ObjectiveStorage;
	owner?: ObjectiveOwnerGateway;
}

export async function createNsObjectiveContext(
	ctx: NsExtensionApi,
	options: CreateNsObjectiveContextOptions = {},
): Promise<ObjectiveCliContext> {
	const git = options.git ?? createNsGitGateway(ctx);
	const repoRootResult = await git.optionalRepoRoot({ cwd: ctx.cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : ctx.cwd;
	const trunkBranchResult = await git.cachedOriginHeadBranch({ cwd: repoRoot });
	const trunkBranch = trunkBranchResult.type === "found" ? trunkBranchResult.value : "main";
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		repoRoot,
		trunkBranch,
		storage: options.storage ?? new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
		owner:
			options.owner ?? new RealObjectiveOwnerGateway(new NsCommandExecApi(ctx), { cwd: repoRoot }),
	};
}
