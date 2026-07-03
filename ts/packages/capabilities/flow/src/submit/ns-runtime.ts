import { createSdlCommandRunner } from "@ns/capability-kit";
import { createSdlGitGateway } from "@ns/capability-kit/git";
import type { CommandRunner } from "@ns/core/command";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "./index.ts";

import type { SdlExtensionApi } from "@ns/kernel/sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface SdlSubmitRuntime {
	commandRunner: CommandRunner;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
}

/** Temporary internal migration seam; not exported from `@ns/kernel/sdk`. */
export function createSdlSubmitRuntime(ctx: SdlExtensionApi): SdlSubmitRuntime {
	const commandRunner = createSdlCommandRunner(ctx);
	return {
		commandRunner,
		submitGateway: new RealSubmitGateway(commandRunner),
		metadataGateway: new RealSubmitMetadataGateway(commandRunner),
		prDescription: {
			githubPr: new RealGithubPrGateway(commandRunner),
			textGenerator: ctx.textGenerator,
			git: createSdlGitGateway(ctx),
			env: ctx.env,
		},
	};
}
