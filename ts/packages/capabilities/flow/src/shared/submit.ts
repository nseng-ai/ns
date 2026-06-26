import { RealGithubPrGateway } from "@sdl/core/submit";
import type { CommandRunner } from "@sdl/core/exec";
import { createSdlCommandRunner, createSdlGitGateway } from "@sdl/capability-kit";
import {
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "@sdl/graphite/submit";

import type { SdlExtensionApi } from "sdl-sdk";

export { RealGithubPrGateway, RealSubmitGateway, RealSubmitMetadataGateway, runSubmitCommand };
export type { RunSubmitCommandOptions, SubmitCommandResult, SubmitFailureTranscript };

export interface SdlSubmitRuntime {
	commandRunner: CommandRunner;
	submitGateway: RealSubmitGateway;
	metadataGateway: RealSubmitMetadataGateway;
	prDescription: RunSubmitCommandOptions["prDescription"];
}

/** Temporary internal migration seam; not exported from `sdl-sdk`. */
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
