import { createSdlCommandRunner } from "@sdl/capability-kit/command-runner";
import { createSdlGitGateway } from "@sdl/capability-kit/git";
import type { SdlExtensionApi } from "sdl-sdk";

import { RealAutopilotGateway } from "../operations/autopilot/gateway.ts";
import { RealObjectiveStorageGateway } from "../real-storage.ts";
import { ObjectiveStorage } from "../storage.ts";
import type { ObjectiveCliContext } from "../context.ts";

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
		autopilot: new RealAutopilotGateway(createSdlCommandRunner(ctx)),
	};
}
