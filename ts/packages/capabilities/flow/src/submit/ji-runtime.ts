import { createSdlCommandRunner } from "@ji/capability-kit";
import { createSdlGitGateway } from "@ji/capability-kit/git";
import type { CommandRunner } from "@ji/core/command";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "./index.ts";

import type { SdlExtensionApi } from "@ji/kernel/sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface SdlSubmitRuntime {
	commandRunner: CommandRunner;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
}

/** Temporary internal migration seam; not exported from `@ji/kernel/sdk`. */
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
