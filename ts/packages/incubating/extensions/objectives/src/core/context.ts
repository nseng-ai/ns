import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway, GitTrunkBranchResult } from "@nseng-ai/foundation/git";

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
	const trunkBranchResult = await git.trunkBranch({ cwd: repoRoot });
	const trunkBranch = resolvedObjectiveTrunkBranch(trunkBranchResult);
	return {
		cwd,
		env,
		repoRoot,
		trunkBranch,
		storage: new ObjectiveStorage(new RealObjectiveStorageGateway(repoRoot)),
		git,
	};
}

export function resolvedObjectiveTrunkBranch(result: GitTrunkBranchResult): string {
	if (result.type === "resolved") return result.resolution.branch;
	throw new Error(formatObjectiveTrunkFailure(result));
}

function formatObjectiveTrunkFailure(
	result: Exclude<GitTrunkBranchResult, { type: "resolved" }>,
): string {
	switch (result.type) {
		case "selected-remote-invalid":
			return `Cannot create Objective context: selected remote \`${result.remote}\` is invalid. ${result.error.message}`;
		case "configured-branch-invalid":
			return `Cannot create Objective context: configured trunk \`${result.branch}\` is invalid. ${result.error.message}`;
		case "cached-remote-head-missing":
			return `Cannot create Objective context: \`${result.remoteHeadRef}\` is missing. Fetch remote \`${result.remote}\`, or configure [git].trunk in ns.toml.`;
		case "cached-remote-head-malformed":
			return `Cannot create Objective context: \`${result.remoteHeadRef}\` has malformed target ${JSON.stringify(result.target)}. Repair the cached remote HEAD, or configure [git].trunk in ns.toml.`;
		case "local-branch-missing":
			return `Cannot create Objective context: trunk local ref \`${result.resolution.localRef}\` is missing. Create or fetch branch \`${result.resolution.branch}\`.`;
		case "remote-tracking-branch-missing":
			return `Cannot create Objective context: trunk tracking ref \`${result.resolution.remoteTrackingRef}\` is missing. Fetch remote \`${result.resolution.remote}\`.`;
		case "command-failure":
			return `Cannot create Objective context: trunk resolution failed while attempting to ${result.operation.replaceAll("-", " ")} (${result.reason}). ${result.error.message}`;
	}
}
