import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway, type GitGateway } from "@sdl/core/git";
import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackGateway,
} from "@sdl/core/github-pr-feedback";

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
