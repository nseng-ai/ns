import { createSdlGitGateway } from "@ns/capability-kit/git";
import type { GitGateway } from "@ns/capability-kit/git";
import type { SdlExtensionApi } from "@ns/kernel/sdk";

import { RealObjectiveStorageGateway } from "../core/real-storage.ts";
import { ObjectiveStorage } from "../core/storage.ts";
import type { ObjectiveCliContext } from "../core/context.ts";

/** Gateway substitutions for derived contexts (runner overrides, tests). */
export interface CreateSdlObjectiveContextOptions {
	git?: GitGateway;
	storage?: ObjectiveStorage;
}

export async function createSdlObjectiveContext(
	ctx: SdlExtensionApi,
	options: CreateSdlObjectiveContextOptions = {},
): Promise<ObjectiveCliContext> {
	const git = options.git ?? createSdlGitGateway(ctx);
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
