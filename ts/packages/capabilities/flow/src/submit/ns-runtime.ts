import { createNsCommandRunner } from "@nseng-ai/capability-kit";
import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	formatCommand,
	type CommandExecApi,
	type CommandRunner,
} from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type FlowPrDescriptionDescriptorSource,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "./index.ts";
import { RealCheckpointGateway, type CheckpointRunContext } from "../checkpoint/checkpoint.ts";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { commandOperations, withActiveOperations } from "../phase-stream/matrix-progress-core.ts";

import type { NsExtensionApi } from "@nseng-ai/sdk";

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

/** Temporary internal migration seam; not exported from `@nseng-ai/sdk`. */
export function createNsSubmitRuntime(
	ctx: NsExtensionApi,
	descriptorSource: FlowPrDescriptionDescriptorSource,
): NsSubmitRuntime {
	const commandRunner = createNsCommandRunner(ctx);
	const git = createNsGitGateway(ctx);
	return {
		commandRunner,
		createCheckpointRunContext: (onActiveOperations) => {
			const commands: CommandExecApi = {
				exec: async (command, args, options) =>
					await withActiveOperations(
						onActiveOperations,
						commandOperations([formatCommand(command, args)]),
						async () => await commandRunner(command, args, options),
					),
			};
			return {
				gateway: new RealCheckpointGateway({
					runner: commandRunner,
					git,
					...optionalEntry("onActiveOperations", onActiveOperations),
				}),
				graphite: new RealGraphiteBranchGateway(commands),
				...(onActiveOperations === undefined ? {} : { onActiveOperations }),
			};
		},
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitMetadataGateway(commandRunner),
		git,
		prDescription: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git,
			descriptorSource,
			env: ctx.env,
		},
	};
}
