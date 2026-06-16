import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealObjectiveGitFactsGateway, type ObjectiveGitFactsGateway } from "./git-facts.ts";
import { RealObjectiveStorageGateway } from "./real-storage.ts";
import { ObjectiveStorage } from "./storage.ts";

export interface ObjectiveCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	repoRoot: string;
	trunkBranch: string;
	storage: ObjectiveStorage;
	gitFacts: ObjectiveGitFactsGateway;
}

export async function createRealObjectiveContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined; git?: GitGateway | undefined } = {},
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
		gitFacts: new RealObjectiveGitFactsGateway(git),
	};
}
