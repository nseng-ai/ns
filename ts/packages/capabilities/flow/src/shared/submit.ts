import type { CommandRunner } from "@sdl/exec";
import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { RealGitGateway } from "@sdl/git";
import { createSdlCommandRunner } from "@sdl/capability-kit";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type RunSubmitCommandOptions,
	type SubmitCommandResult,
	type SubmitFailureTranscript,
} from "../submit/index.ts";

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
			git: new RealGitGateway(new SdlCommandExecApi(ctx)),
			env: ctx.env,
		},
	};
}
