import { NodeCommandExecApi, runCommand } from "@ji/core/exec";
import { RealGitGateway } from "@ji/capability-kit/git";
import type { GitGateway } from "@ji/capability-kit/git";
import { RealGithubPrFeedbackGateway } from "@ji/capability-kit/github/pr-feedback";
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
