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
	type TimeServices,
} from "./index.ts";
import { RealCheckpointGateway, type CheckpointGateway } from "../checkpoint/checkpoint.ts";

import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface NsSubmitRuntime {
	commandRunner: CommandRunner;
	checkpointGateway: CheckpointGateway;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
	git: Pick<GitGateway, "optionalRepoRoot">;
}

export interface NsSubmitRuntimeOptions {
	time?: TimeServices;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/kernel/sdk`. */
export function createNsSubmitRuntime(
	ctx: NsExtensionApi,
	options: NsSubmitRuntimeOptions = {},
): NsSubmitRuntime {
	const commandRunner = createNsCommandRunner(ctx);
	const git = createNsGitGateway(ctx);
	return {
		commandRunner,
		checkpointGateway: new RealCheckpointGateway({ runner: commandRunner, git }),
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitMetadataGateway(commandRunner),
		git,
		prDescription: {
			githubPr: new RealGithubPrGateway(
				commandRunner,
				options.time?.timers === undefined ? {} : { timers: options.time.timers },
			),
			textGenerator: ctx.textGenerator,
			git,
			env: ctx.env,
			...(options.time === undefined ? {} : { time: options.time }),
		},
	};
}
