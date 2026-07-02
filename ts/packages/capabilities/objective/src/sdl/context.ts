import { createSdlGitGateway } from "@sdl/capability-kit/git";
import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import { RealObjectiveStorageGateway } from "../core/real-storage.ts";
import { ObjectiveStorage } from "../core/storage.ts";
import type { ObjectiveCliContext } from "../core/context.ts";

export async function createSdlObjectiveContext(
	ctx: SdlExtensionApi,
): Promise<ObjectiveCliContext> {
	const git = createSdlGitGateway(ctx);
	const repoRootResult = await git.optionalRepoRoot({ cwd: ctx.cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : ctx.cwd;
	const trunkBranchResult = await git.trunkBranch({ cwd: repoRoot });
	const trunkBranch = trunkBranchResult.type === "found" ? trunkBranchResult.value : "main";
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		repoRoot,
		trunkBranch,
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}
