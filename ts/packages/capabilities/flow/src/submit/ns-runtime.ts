import { createNsCommandRunner } from "@nseng-ai/capability-kit";
import { createNsGitGateway, type GitGateway } from "@nseng-ai/capability-kit/git";
import type { CommandRunner } from "@nseng-ai/foundation/command";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "./index.ts";
import { RealCheckpointGateway, type CheckpointRunContext } from "../checkpoint/checkpoint.ts";

import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface NsSubmitRuntime {
	commandRunner: CommandRunner;
	createCheckpointRunContext: (
		onActiveOperations?: CheckpointRunContext["onActiveOperations"],
	) => CheckpointRunContext;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
	git: Pick<GitGateway, "optionalRepoRoot">;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/kernel/sdk`. */
export function createNsSubmitRuntime(ctx: NsExtensionApi): NsSubmitRuntime {
	const commandRunner = createNsCommandRunner(ctx);
	const git = createNsGitGateway(ctx);
	return {
		commandRunner,
		createCheckpointRunContext: (onActiveOperations) => ({
			gateway: new RealCheckpointGateway({
				runner: commandRunner,
				git,
				...(onActiveOperations === undefined ? {} : { onActiveOperations }),
			}),
			...(onActiveOperations === undefined ? {} : { onActiveOperations }),
		}),
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitMetadataGateway(commandRunner),
		git,
		prDescription: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git,
			env: ctx.env,
		},
	};
}
