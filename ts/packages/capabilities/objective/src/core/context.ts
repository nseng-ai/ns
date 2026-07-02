import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/capability-kit/git";
import type { GitGateway } from "@sdl/capability-kit/git";

import { RealObjectiveStorageGateway } from "./real-storage.ts";
import { ObjectiveStorage } from "./storage.ts";
import type { ExplicitUndefined } from "@sdl/core/primitives";

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
	const trunkBranchResult = await git.trunkBranch({ cwd: repoRoot });
	const trunkBranch = trunkBranchResult.type === "found" ? trunkBranchResult.value : "main";
	return {
		cwd,
		env,
		repoRoot,
		trunkBranch,
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}
