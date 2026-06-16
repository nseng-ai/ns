import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealObjectiveStorageGateway } from "./real-storage.ts";
import { ObjectiveStorage } from "./storage.ts";

export interface ObjectiveCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	repoRoot: string;
	storage: ObjectiveStorage;
}

export async function createRealObjectiveContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined; git?: GitGateway | undefined } = {},
): Promise<ObjectiveCliContext> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const git = options.git ?? new RealGitGateway(new NodeCommandExecApi());
	const repoRootResult = await git.optionalRepoRoot({ cwd });
	const repoRoot = repoRootResult.type === "found" ? repoRootResult.value : cwd;
	return {
		cwd,
		env,
		repoRoot,
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
	};
}
