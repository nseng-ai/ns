import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway } from "@sdl/git";
import type { GitGateway } from "@sdl/git";
import { RealGithubPrFeedbackGateway } from "@sdl/core/github-pr-feedback";
import type { GithubPrFeedbackGateway } from "./api.ts";

export interface PrAddressContext {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		prFeedback: new RealGithubPrFeedbackGateway(),
	};
}
