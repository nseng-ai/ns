import { createNsCommandRunner } from "@nseng-ai/capability-kit";
import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
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

import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface NsSubmitRuntime {
	commandRunner: CommandRunner;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
}

/** Temporary internal migration seam; not exported from `@nseng-ai/kernel/sdk`. */
export function createNsSubmitRuntime(ctx: NsExtensionApi): NsSubmitRuntime {
	const commandRunner = createNsCommandRunner(ctx);
	return {
		commandRunner,
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitMetadataGateway(commandRunner),
		prDescription: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git: createNsGitGateway(ctx),
			env: ctx.env,
		},
	};
}
