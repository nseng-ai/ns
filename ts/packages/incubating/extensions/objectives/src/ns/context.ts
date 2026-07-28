import { createNsGitGateway } from "@nseng-ai/extension-kit";
import {
	nodeRepositoryTrunkConfigLoader,
	resolveRepositoryTrunk,
	type RepositoryTrunkResult,
} from "@nseng-ai/extension-kit/repository-trunk";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { RealObjectiveStorageGateway } from "../core/real-storage.ts";
import { ObjectiveStorage } from "../core/storage.ts";
import type { ObjectiveCliContext } from "../core/context.ts";

/** Gateway substitutions for derived contexts (runner overrides, tests). */
export interface CreateNsObjectiveContextOptions {
	git?: GitGateway;
	storage?: ObjectiveStorage;
	repositoryTrunk?: RepositoryTrunkResult;
}

export async function createNsObjectiveContext(
	ctx: NsExtensionApi,
	options: CreateNsObjectiveContextOptions = {},
): Promise<ObjectiveCliContext> {
	const git = options.git ?? createNsGitGateway(ctx);
	const repoRootResult = await git.optionalRepoRoot({ cwd: ctx.cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : ctx.cwd;
	const repositoryTrunk =
		options.repositoryTrunk ??
		(await resolveRepositoryTrunk({
			repoRoot,
			git,
			config: nodeRepositoryTrunkConfigLoader,
			env: ctx.env,
		}));
	if (!repositoryTrunk.ok) {
		throw new Error(`Cannot create Objective context: ${repositoryTrunk.error.message}`);
	}
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		repoRoot,
		trunkBranch: repositoryTrunk.value.branch,
		storage: options.storage ?? new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}
