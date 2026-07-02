import { NodeCommandExecApi, runCommand } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/capability-kit/git";
import type { GitGateway } from "@sdl/capability-kit/git";
import { RealGithubPrFeedbackGateway } from "@sdl/capability-kit/github/pr-feedback";
import type { GithubPrFeedbackGateway } from "./api.ts";

export interface PrAddressContext {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		prFeedback: new RealGithubPrFeedbackGateway(runCommand),
	};
}
