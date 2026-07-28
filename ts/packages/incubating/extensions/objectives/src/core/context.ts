import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	nodeRepositoryTrunkConfigLoader,
	resolveRepositoryTrunk,
} from "@nseng-ai/extension-kit/repository-trunk";

import { RealObjectiveStorageGateway } from "./real-storage.ts";
import { ObjectiveStorage } from "./storage.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface ObjectiveCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	repoRoot: string;
	trunkBranch: string;
	storage: ObjectiveStorage;
	git: GitGateway;
}

export async function createRealObjectiveContext(
	options: {
		cwd?: string;
		env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
		git?: GitGateway;
	} = {},
): Promise<ObjectiveCliContext> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const execApi = new NodeCommandExecApi();
	const git = options.git ?? new RealGitGateway(execApi);
	const repoRootResult = await git.optionalRepoRoot({ cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : cwd;
	const repositoryTrunk = await resolveRepositoryTrunk({
		repoRoot,
		git,
		config: nodeRepositoryTrunkConfigLoader,
		env,
	});
	if (!repositoryTrunk.ok) {
		throw new Error(`Cannot create Objective context: ${repositoryTrunk.error.message}`);
	}
	return {
		cwd,
		env,
		repoRoot,
		trunkBranch: repositoryTrunk.value.branch,
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}
