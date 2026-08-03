import { createNsCommandRunner } from "@nseng-ai/extension-kit";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { CommandExecApi, CommandRunner } from "@nseng-ai/foundation/command";
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
import type { RepositoryWorkflowTarget } from "@nseng-ai/extension-kit/workflow-target";
import {
	RealBranchSubmitPullRequestGateway,
	RealBranchSubmitRepositoryGateway,
} from "./branch-submit-gateways.ts";
import type { BranchSubmitContext } from "./branch-submit.ts";
import { createFlowGraphiteStackGitGateway } from "../stack-squash/graphite-stack-gateway.ts";

import type { NsExtensionApi } from "@nseng-ai/sdk";

export {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitStackInspectionGateway,
	runSubmitCommand,
};
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

interface NsSubmitRuntimeBase {
	commandRunner: CommandRunner;
	createCheckpointRunContext: (
		onActiveOperations?: CheckpointRunContext["onActiveOperations"],
	) => CheckpointRunContext;
	prInventory: Omit<RunSubmitCommandOptions["prInventory"], "modelSelection">;
	git: Pick<GitGateway, "optionalRepoRoot">;
}

export type NsSubmitRuntime =
	| (NsSubmitRuntimeBase & { target: { type: "branch" }; branch: BranchSubmitContext })
	| (NsSubmitRuntimeBase & {
			target: { type: "stack"; provider: "graphite" };
			submitGateway: RealSubmitGateway;
			metadataGateway: RealSubmitStackInspectionGateway;
	  });

export interface CreateNsSubmitRuntimeOptions {
	target?: RepositoryWorkflowTarget;
	graphiteStackGateway?: Pick<GraphiteStackGateway, "stack">;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/sdk`. */
export function createNsSubmitRuntime(
	ctx: NsExtensionApi,
	descriptorSource: FlowPrInventoryDescriptorSource,
	options: CreateNsSubmitRuntimeOptions = {},
): NsSubmitRuntime {
	const commandRunner = createNsCommandRunner(ctx);
	const git = createNsGitGateway(ctx);
	const target = options.target ?? { type: "stack", provider: "graphite" };
	const base: NsSubmitRuntimeBase = {
		commandRunner,
		createCheckpointRunContext: (onActiveOperations) => {
			return {
				gateway: new RealCheckpointGateway({
					runner: commandRunner,
					git,
					...optionalEntry("onActiveOperations", onActiveOperations),
				}),
				git,
				...(onActiveOperations === undefined ? {} : { onActiveOperations }),
			};
		},
		git,
		prInventory: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git,
			descriptorSource,
			env: ctx.env,
		},
	};
	if (target.type === "branch") {
		return {
			...base,
			target,
			branch: {
				repository: new RealBranchSubmitRepositoryGateway(commandRunner, git),
				pullRequests: new RealBranchSubmitPullRequestGateway(commandRunner),
			},
		};
	}
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
		...base,
		target,
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitStackInspectionGateway({ graphite, runner: commandRunner }),
	};
}
