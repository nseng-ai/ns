import { createNsCommandRunner, createNsGitGateway } from "@nseng-ai/extension-kit";
import {
	nodeRepositoryTrunkConfigLoader,
	resolveRepositoryTrunk,
} from "@nseng-ai/extension-kit/repository-trunk";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import {
	formatCommand,
	type CommandExecApi,
	type CommandRunner,
} from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitStackInspectionGateway,
	runSubmitCommand,
	type FlowPrInventoryDescriptorSource,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "./index.ts";
import { RealCheckpointGateway, type CheckpointRunContext } from "../checkpoint/checkpoint.ts";
import {
	RealGraphiteStackGateway,
	type GraphiteStackGateway,
} from "@nseng-ai/extension-kit/graphite/stack";
import { commandOperations, withActiveOperations } from "../phase-stream/matrix-progress-core.ts";
import { createFlowGraphiteStackGitGateway } from "../stack-squash/graphite-stack-gateway.ts";

import type { NsExtensionApi } from "@nseng-ai/sdk";

export {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitStackInspectionGateway,
	runSubmitCommand,
};
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface NsSubmitRuntime {
	commandRunner: CommandRunner;
	createCheckpointRunContext: (
		onActiveOperations?: CheckpointRunContext["onActiveOperations"],
	) => Promise<CheckpointRunContext>;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitStackInspectionGateway;
	prInventory: Omit<RunSubmitCommandOptions["prInventory"], "modelSelection">;
	git: Pick<GitGateway, "optionalRepoRoot">;
}

export interface CreateNsSubmitRuntimeOptions {
	graphiteStackGateway?: Pick<GraphiteStackGateway, "stack">;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/sdk`. */
export async function createNsSubmitRuntime(
	ctx: NsExtensionApi,
	descriptorSource: FlowPrInventoryDescriptorSource,
	options: CreateNsSubmitRuntimeOptions = {},
): Promise<NsSubmitRuntime> {
	const commandRunner = createNsCommandRunner(ctx);
	const git = createNsGitGateway(ctx);
	const graphiteExecApi: CommandExecApi = {
		exec: (command, args, execOptions) => commandRunner(command, args, execOptions),
	};
	const graphite =
		options.graphiteStackGateway ??
		new RealGraphiteStackGateway({
			env: ctx.env,
			execApi: graphiteExecApi,
			git: createFlowGraphiteStackGitGateway(git),
		});
	return {
		commandRunner,
		createCheckpointRunContext: async (onActiveOperations) => {
			const commands: CommandExecApi = {
				exec: async (command, args, execOptions) =>
					await withActiveOperations(
						onActiveOperations,
						commandOperations([formatCommand(command, args)]),
						async () => await commandRunner(command, args, execOptions),
					),
			};
			const checkpointGit = new RealGitGateway(commands);
			const repoRoot = await checkpointGit.repoRoot({ cwd: ctx.cwd, env: ctx.env });
			if (!repoRoot.ok) throw new Error(repoRoot.error.message);
			const repositoryTrunk = await resolveRepositoryTrunk({
				repoRoot: repoRoot.value,
				git: checkpointGit,
				config: nodeRepositoryTrunkConfigLoader,
				env: ctx.env,
			});
			return {
				gateway: new RealCheckpointGateway({
					runner: commandRunner,
					git: checkpointGit,
					...optionalEntry("onActiveOperations", onActiveOperations),
				}),
				repositoryTrunk,
				...(onActiveOperations === undefined ? {} : { onActiveOperations }),
			};
		},
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitStackInspectionGateway({ graphite, runner: commandRunner }),
		git,
		prInventory: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git,
			descriptorSource,
			env: ctx.env,
		},
	};
}
